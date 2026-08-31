/**
 * BR-161 — Apple/iCloud read-only availability overlay.
 */

require("dotenv").config();
process.env.META_TOKEN_ENCRYPTION_KEY =
  process.env.META_TOKEN_ENCRYPTION_KEY || "a".repeat(64);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");

const { getAvailableSlots } = require("../services/appointmentSchedulingEngine");
const { calculateBusyWindowsFromIcs } = require("../core/availability/icsBusyWindowCalculator");
const {
  PROVIDERS,
  createAvailabilityAuthError,
  createAvailabilityUnavailableError,
  unionBusyRanges
} = require("../core/availability/availabilityTypes");
const { isIcloudAvailabilityEnabled, FLAG_ENV } = require("../core/availability/icloudAvailabilityFlag");
const { presentStatus, publicStatusWithoutSecrets } = require("../services/icloudCalendarIntegrationService");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");

const AGENT = "00000000-0000-4000-8000-0000000000aa";
const TV_ORG = "00000000-0000-4000-8000-000000000001";
const TL_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const FUTURE_ORG = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW_MS = Date.parse("2026-03-03T08:00:00-05:00");

function weekSchedule(enabledDay, start, end) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek === enabledDay,
    blocks: dayOfWeek === enabledDay ? [{ start, end }] : []
  }));
}

function profileFor(enabledDay, start, end, timezone = "America/New_York") {
  return {
    appointmentProfile: {
      workingSchedule: weekSchedule(enabledDay, start, end),
      defaults: {
        defaultDurationMinutes: 30,
        recruitingInterviewDurationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumBookingLeadMinutes: 0,
        timezone
      }
    },
    timezone
  };
}

function toRanges(periods, source) {
  return periods.map((period) => ({
    start: Date.parse(period.start),
    end: Date.parse(period.end),
    source
  }));
}

function deps({ googleBusy = [], icloudBusy = [], appointments = [], timezone = "America/New_York" } = {}) {
  return {
    nowMs: NOW_MS,
    getAppointmentProfileFn: async () => profileFor(2, "09:00", "17:00", timezone),
    getSchedulingSettingsFn: async () => ({ respectPersonalCalendar: true }),
    searchAppointmentsFn: async () => ({ items: appointments }),
    queryFreeBusyFn: async () => toRanges(googleBusy, PROVIDERS.GOOGLE_CALENDAR),
    queryIcloudBusyFn: async () =>
      Array.isArray(icloudBusy) ? toRanges(icloudBusy, PROVIDERS.ICLOUD_CALENDAR) : icloudBusy()
  };
}

async function tuesdaySlots(options = {}) {
  return getAvailableSlots({
    agentId: AGENT,
    organizationId: options.organizationId || TV_ORG,
    date: options.date || "2026-03-03",
    durationMinutes: 30,
    maxResults: 50,
    dependencies: deps(options)
  });
}

function icsEnvelope(vevent) {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${vevent}\nEND:VCALENDAR\n`;
}

describe("BR-161 iCloud availability overlay", () => {
  test("1. Google-only user unchanged when iCloud returns no busy", async () => {
    const googleOnly = await tuesdaySlots({
      googleBusy: [{ start: "2026-03-03T14:00:00.000Z", end: "2026-03-03T14:30:00.000Z" }],
      icloudBusy: []
    });
    const baseline = await getAvailableSlots({
      agentId: AGENT,
      organizationId: TV_ORG,
      date: "2026-03-03",
      durationMinutes: 30,
      maxResults: 50,
      dependencies: {
        nowMs: NOW_MS,
        getAppointmentProfileFn: async () => profileFor(2, "09:00", "17:00"),
        getSchedulingSettingsFn: async () => ({ respectPersonalCalendar: true }),
        searchAppointmentsFn: async () => ({ items: [] }),
        queryFreeBusyFn: async () =>
          toRanges(
            [{ start: "2026-03-03T14:00:00.000Z", end: "2026-03-03T14:30:00.000Z" }],
            PROVIDERS.GOOGLE_CALENDAR
          )
      }
    });
    assert.deepEqual(
      googleOnly.slots.map((slot) => slot.timeKey),
      baseline.slots.map((slot) => slot.timeKey)
    );
    assert.equal(googleOnly.slots.some((slot) => slot.timeKey === "09:00"), false);
    assert.equal(googleOnly.slots.some((slot) => slot.timeKey === "09:30"), true);
  });

  test("2. iCloud-only busy period blocks slot", async () => {
    const result = await tuesdaySlots({
      icloudBusy: [{ start: "2026-03-03T15:00:00.000Z", end: "2026-03-03T15:30:00.000Z" }]
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.equal(keys.includes("10:00"), false);
    assert.equal(keys.includes("09:00"), true);
    assert.equal(keys.includes("10:30"), true);
  });

  test("3. Google + iCloud busy periods both block", async () => {
    const result = await tuesdaySlots({
      googleBusy: [{ start: "2026-03-03T14:00:00.000Z", end: "2026-03-03T14:30:00.000Z" }],
      icloudBusy: [{ start: "2026-03-03T16:00:00.000Z", end: "2026-03-03T16:30:00.000Z" }]
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.equal(keys.includes("09:00"), false);
    assert.equal(keys.includes("11:00"), false);
    assert.equal(keys.includes("10:00"), true);
  });

  test("4. overlapping busy periods union correctly", () => {
    const merged = unionBusyRanges([
      { start: Date.parse("2026-03-03T14:00:00.000Z"), end: Date.parse("2026-03-03T15:00:00.000Z"), source: "google_calendar" },
      { start: Date.parse("2026-03-03T14:30:00.000Z"), end: Date.parse("2026-03-03T15:30:00.000Z"), source: "icloud_calendar" }
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].start, Date.parse("2026-03-03T14:00:00.000Z"));
    assert.equal(merged[0].end, Date.parse("2026-03-03T15:30:00.000Z"));
  });

  test("5. recurring event blocks correct occurrence", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260303T100000
DTEND;TZID=America/New_York:20260303T103000
RRULE:FREQ=WEEKLY;BYDAY=TU
UID:weekly-tu
END:VEVENT`);
    const week1 = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-03T00:00:00.000Z",
      timeMax: "2026-03-04T00:00:00.000Z",
      timezone: "America/New_York"
    });
    const week2 = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-10T00:00:00.000Z",
      timeMax: "2026-03-11T00:00:00.000Z",
      timezone: "America/New_York"
    });
    assert.equal(week1.length, 1);
    assert.equal(week2.length, 1);
    assert.equal(week1[0].start, "2026-03-03T15:00:00.000Z");
    assert.equal(week2[0].start, "2026-03-10T14:00:00.000Z");
  });

  test("6. EXDATE removes occurrence", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260303T100000
DTEND;TZID=America/New_York:20260303T103000
RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3
EXDATE;TZID=America/New_York:20260310T100000
UID:weekly-ex
END:VEVENT`);
    const busy = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-03T00:00:00.000Z",
      timeMax: "2026-03-18T00:00:00.000Z",
      timezone: "America/New_York"
    });
    const starts = busy.map((window) => window.start);
    assert.equal(starts.includes("2026-03-03T15:00:00.000Z"), true);
    assert.equal(starts.includes("2026-03-10T14:00:00.000Z"), false);
    assert.equal(starts.includes("2026-03-17T14:00:00.000Z"), true);
  });

  test("7. recurrence override works", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260303T100000
DTEND;TZID=America/New_York:20260303T103000
RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=2
UID:weekly-override
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260310T130000
DTEND;TZID=America/New_York:20260310T133000
RECURRENCE-ID;TZID=America/New_York:20260310T100000
UID:weekly-override
END:VEVENT`);
    const busy = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-10T00:00:00.000Z",
      timeMax: "2026-03-11T00:00:00.000Z",
      timezone: "America/New_York"
    });
    assert.equal(busy.length, 1);
    assert.equal(busy[0].start, "2026-03-10T17:00:00.000Z");
  });

  test("8. all-day event blocks correct local day", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;VALUE=DATE:20260303
DTEND;VALUE=DATE:20260304
UID:all-day
END:VEVENT`);
    const ny = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-03T00:00:00.000Z",
      timeMax: "2026-03-04T10:00:00.000Z",
      timezone: "America/New_York"
    });
    assert.equal(ny.length, 1);
    assert.equal(ny[0].allDay, true);
    assert.equal(ny[0].start, "2026-03-03T05:00:00.000Z");
    assert.equal(ny[0].end, "2026-03-04T05:00:00.000Z");
  });

  test("9. transparent event does not block", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260303T100000
DTEND;TZID=America/New_York:20260303T120000
TRANSP:TRANSPARENT
UID:free
END:VEVENT`);
    const busy = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-03T00:00:00.000Z",
      timeMax: "2026-03-04T00:00:00.000Z",
      timezone: "America/New_York"
    });
    assert.deepEqual(busy, []);
  });

  test("10. cancelled event does not block", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260303T100000
DTEND;TZID=America/New_York:20260303T120000
STATUS:CANCELLED
UID:cancelled
END:VEVENT`);
    const busy = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-03T00:00:00.000Z",
      timeMax: "2026-03-04T00:00:00.000Z",
      timezone: "America/New_York"
    });
    assert.deepEqual(busy, []);
  });

  test("11. DST / timezone conversion correct", () => {
    const ics = icsEnvelope(`BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260308T020000
DTEND;TZID=America/New_York:20260308T023000
UID:dst
END:VEVENT`);
    const busy = calculateBusyWindowsFromIcs({
      ics,
      timeMin: "2026-03-08T00:00:00.000Z",
      timeMax: "2026-03-09T00:00:00.000Z",
      timezone: "America/New_York"
    });
    assert.equal(busy.length, 1);
    assert.equal(Number.isFinite(Date.parse(busy[0].start)), true);
    assert.ok(Date.parse(busy[0].end) > Date.parse(busy[0].start));
  });

  test("12. user timezone differs from tenant timezone", async () => {
    const chicago = await tuesdaySlots({
      timezone: "America/Chicago",
      icloudBusy: [{ start: "2026-03-03T15:00:00.000Z", end: "2026-03-03T15:30:00.000Z" }]
    });
    assert.equal(chicago.timezone, "America/Chicago");
    assert.equal(
      chicago.slots.some((slot) => slot.startTimeISO === "2026-03-03T15:00:00.000Z"),
      false
    );
  });

  test("13. connected iCloud 401/403 fails closed", async () => {
    const result = await tuesdaySlots({
      icloudBusy: () => {
        throw createAvailabilityAuthError("ICLOUD_RECONNECT_REQUIRED");
      }
    });
    assert.deepEqual(result.slots, []);
    assert.match(result.conflictExplanation, /Reconnect Apple Calendar/);
    assert.equal(result.availabilityBlockedReason, "ICLOUD_RECONNECT_REQUIRED");
  });

  test("14. transient Apple failure does not fail open", async () => {
    const result = await tuesdaySlots({
      icloudBusy: () => {
        throw createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE");
      }
    });
    assert.deepEqual(result.slots, []);
    assert.match(result.conflictExplanation, /temporarily unavailable/);
    assert.equal(result.availabilityBlockedReason, "ICLOUD_UNAVAILABLE");
  });

  test("15. confirm-time recheck catches newly created iCloud conflict", async () => {
    const offered = await tuesdaySlots({ icloudBusy: [] });
    assert.equal(offered.slots.some((slot) => slot.timeKey === "10:00"), true);

    const confirm = await tuesdaySlots({
      icloudBusy: [{ start: "2026-03-03T15:00:00.000Z", end: "2026-03-03T15:30:00.000Z" }]
    });
    assert.equal(confirm.slots.some((slot) => slot.timeKey === "10:00"), false);
  });

  test("16-18. tenant isolation keys stay org + user + provider", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../services/icloudCalendarIntegrationService.js"),
      "utf8"
    );
    assert.match(serviceSrc, /\.eq\("organization_id", organizationId\)/);
    assert.match(serviceSrc, /\.eq\("user_id", userId\)/);
    assert.match(serviceSrc, /\.eq\("provider", PROVIDER\)/);
    assert.doesNotMatch(serviceSrc, /00000000-0000-4000-8000-000000000001/);
    assert.doesNotMatch(serviceSrc, /af8fb707-f26c-4152-ad77-2d079d30bc8a/);
    assert.ok(TV_ORG !== TL_ORG && FUTURE_ORG !== TV_ORG);
  });

  test("19. ciphertext never returned through API status", () => {
    const encryption = createTokenEncryption();
    const encrypted = encryption.encrypt("fake-app-specific-password");
    const status = publicStatusWithoutSecrets(
      presentStatus(
        {
          user_id: AGENT,
          status: "connected",
          credentials_encrypted: encrypted,
          config: { appleAccountEmail: "user@example.com" }
        },
        { available: true }
      )
    );
    const serialized = JSON.stringify(status);
    assert.doesNotMatch(serialized, /fake-app-specific-password/);
    assert.doesNotMatch(serialized, /credentials_encrypted/);
    assert.doesNotMatch(serialized, /enc:v1:/);
    assert.equal(status.appleAccountEmail, "user@example.com");
  });

  test("20. password / raw ICS / event titles never logged", () => {
    const files = [
      "icloudCalendarIntegrationService.js",
      "icloudCalDavClient.js",
      "icsBusyWindowCalculator.js"
    ].map((name) =>
      fs.readFileSync(
        path.join(
          __dirname,
          name.includes("Service") ? `../services/${name}` : `../core/availability/${name}`
        ),
        "utf8"
      )
    );
    for (const src of files) {
      assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*password/i);
      assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*ics/i);
      assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*SUMMARY/i);
    }
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../services/icloudCalendarIntegrationService.js"),
      "utf8"
    );
    assert.match(serviceSrc, /component: "icloud_calendar"/);
    assert.match(serviceSrc, /organizationId: fields.organizationId/);
  });

  test("21. existing Google scheduling engine still exported", () => {
    assert.equal(typeof getAvailableSlots, "function");
    const engineSrc = fs.readFileSync(
      path.join(__dirname, "../services/appointmentSchedulingEngine.js"),
      "utf8"
    );
    assert.match(engineSrc, /Google overlay remains fail-open/);
    assert.match(engineSrc, /queryFreeBusy/);
  });

  test("22. Recruit AI / IUL still use the shared slot engine", () => {
    const reader = fs.readFileSync(
      path.join(__dirname, "../core/recruitAiV2/schedulingAvailabilityReader.js"),
      "utf8"
    );
    const createSrc = fs.readFileSync(
      path.join(__dirname, "../application/appointmentApplicationService.js"),
      "utf8"
    );
    assert.match(reader, /appointmentApplicationService\.getSlots/);
    assert.match(createSrc, /appointmentSchedulingEngine.getAvailableSlots/);
    assert.doesNotMatch(reader, /icloudCalDavClient/);
    assert.doesNotMatch(reader, /createCalendarEvent/);
  });

  test("feature flag defaults off and allowlists work", () => {
    assert.equal(isIcloudAvailabilityEnabled({ organizationId: TV_ORG, userId: AGENT, env: {} }), false);
    assert.equal(
      isIcloudAvailabilityEnabled({
        organizationId: TV_ORG,
        userId: AGENT,
        env: { [FLAG_ENV]: "true" }
      }),
      true
    );
    assert.equal(
      isIcloudAvailabilityEnabled({
        organizationId: TL_ORG,
        userId: AGENT,
        env: {
          [FLAG_ENV]: "true",
          ATLAS_ICLOUD_CALENDAR_AVAILABILITY_ORGANIZATION_IDS: TV_ORG
        }
      }),
      false
    );
  });
});
