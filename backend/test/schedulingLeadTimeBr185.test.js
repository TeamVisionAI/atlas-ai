/**
 * BR-185 — timezone-aware now + minimum booking lead time.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT || "1";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_MINIMUM_BOOKING_LEAD_MINUTES,
  resolveMinimumBookingLeadMinutes,
  isSlotBookableByLeadTime
} = require("../core/schedulingLeadTime");
const { getAvailableSlots } = require("../services/appointmentSchedulingEngine");
const { normalizeAppointmentProfile } = require("../services/appointmentProfileService");
const { buildIsoTimestamp } = require("../services/availabilityService");
const { resolveAvailabilityForTurn } = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { LANGUAGES } = require("../core/recruitAiV2/constants");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { todayIsoDate } = require("../core/followUps/classification");
const { getOrganizationDateWindow, RELATIVE_PERIODS } = require("../core/organizationDateWindow");

const TZ = "America/New_York";
const AGENT = "41000000-0000-4000-8000-000000000185";
const ORG = "21000000-0000-4000-8000-000000000185";

function weekSchedule(enabledDay, start, end) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek === enabledDay,
    blocks: dayOfWeek === enabledDay ? [{ start, end }] : []
  }));
}

function profile({ day = 5, start = "18:00", end = "23:00", lead = 120 } = {}) {
  return {
    appointmentProfile: {
      workingSchedule: weekSchedule(day, start, end),
      defaults: {
        defaultDurationMinutes: 30,
        recruitingInterviewDurationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumBookingLeadMinutes: lead,
        timezone: TZ
      }
    },
    timezone: TZ
  };
}

function deps(nowMs, extras = {}) {
  return {
    nowMs,
    getAppointmentProfileFn: extras.getAppointmentProfileFn || (async () => profile(extras.profile || {})),
    getSchedulingSettingsFn: async () => ({ respectPersonalCalendar: false }),
    searchAppointmentsFn: async () => ({ items: extras.appointments || [] }),
    queryFreeBusyFn: async () => [],
    minimumBookingLeadMinutes: extras.minimumBookingLeadMinutes
  };
}

test("default lead time is 120 and missing values self-correct", () => {
  assert.equal(DEFAULT_MINIMUM_BOOKING_LEAD_MINUTES, 120);
  assert.equal(resolveMinimumBookingLeadMinutes(undefined), 120);
  assert.equal(resolveMinimumBookingLeadMinutes(null), 120);
  assert.equal(resolveMinimumBookingLeadMinutes(90), 90);
  assert.equal(resolveMinimumBookingLeadMinutes(0), 0);
  const normalized = normalizeAppointmentProfile({ defaults: { timezone: TZ } });
  assert.equal(normalized.defaults.minimumBookingLeadMinutes, 120);
});

test("timezone-aware now rejects 8:30 and 8:45 when local time is 8:23 PM", async () => {
  const nowMs = Date.parse("2026-08-14T20:23:00-04:00");
  const result = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-14",
    purpose: "recruiting_interview",
    dependencies: deps(nowMs, { profile: { day: 5, start: "20:00", end: "22:00" } })
  });
  const times = result.slots.map((slot) => slot.timeKey);
  assert.equal(times.includes("20:30"), false);
  assert.equal(times.includes("20:45"), false);
  assert.equal(times.includes("20:00"), false);
});

test("tenant lead below the 120 default is honored and not overridden", async () => {
  const nowMs = Date.parse("2026-08-14T18:00:00-04:00");
  const defaultLead = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-14",
    purpose: "recruiting_interview",
    dependencies: deps(nowMs, { profile: { day: 5, start: "19:00", end: "21:00", lead: 120 } })
  });
  const tenantLead = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-14",
    purpose: "recruiting_interview",
    dependencies: deps(nowMs, { profile: { day: 5, start: "19:00", end: "21:00", lead: 60 } })
  });
  assert.equal(defaultLead.slots.some((slot) => slot.timeKey === "19:00"), false);
  assert.equal(tenantLead.slots.some((slot) => slot.timeKey === "19:00"), true);
});

test("slot 119 minutes away is rejected; 120 and later are allowed", async () => {
  const nowMs = Date.parse("2026-08-14T18:00:00-04:00");
  const result = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-14",
    purpose: "recruiting_interview",
    dependencies: deps(nowMs, { profile: { day: 5, start: "19:30", end: "21:00" } })
  });
  const times = result.slots.map((slot) => slot.timeKey);
  assert.equal(isSlotBookableByLeadTime(nowMs + 119 * 60 * 1000, nowMs, 120), false);
  assert.equal(isSlotBookableByLeadTime(nowMs + 120 * 60 * 1000, nowMs, 120), true);
  assert.equal(isSlotBookableByLeadTime(nowMs + 150 * 60 * 1000, nowMs, 120), true);
  assert.equal(times.includes("19:30"), false);
  assert.equal(times.includes("20:00"), true);
  assert.equal(times.includes("20:30"), true);
});

test("no valid same-day slot continues to the next valid day", async () => {
  const nowMs = Date.parse("2026-08-14T20:23:00-04:00");
  const saturdayProfile = {
    appointmentProfile: {
      workingSchedule: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        enabled: dayOfWeek === 5 || dayOfWeek === 6,
        blocks: [{ start: "20:00", end: "22:00" }]
      })),
      defaults: {
        defaultDurationMinutes: 30,
        recruitingInterviewDurationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumBookingLeadMinutes: 120,
        timezone: TZ
      }
    },
    timezone: TZ
  };

  const availability = await resolveAvailabilityForTurn({
    context: createConversationContext({
      organizationId: ORG,
      timezone: TZ,
      appointment: { proposedDate: "2026-08-14" },
      _testNow: new Date(nowMs)
    }),
    interpretation: {
      intent: "reschedule_request",
      entities: { requestedDate: "2026-08-14" }
    },
    options: {
      agentId: AGENT,
      now: new Date(nowMs),
      getSlots: async ({ date, dateEnd }) =>
        getAvailableSlots({
          agentId: AGENT,
          organizationId: ORG,
          date,
          dateEnd,
          purpose: "recruiting_interview",
          dependencies: deps(nowMs, { getAppointmentProfileFn: async () => saturdayProfile })
        })
    }
  });

  assert.equal(availability.todayUnavailableAfterLead, true);
  assert.ok((availability.nearestAlternatives || []).length >= 1);
  assert.equal(availability.nearestAlternatives[0].date, "2026-08-15");
  assert.equal(
    availability.nearestAlternatives.every((slot) => slot.date !== "2026-08-14"),
    true
  );
});

test("rescheduling uses the same lead-time guardrail", async () => {
  const nowMs = Date.parse("2026-08-14T20:23:00-04:00");
  const result = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-14",
    purpose: "recruiting_interview",
    excludeAppointmentId: "appt-current",
    dependencies: deps(nowMs, {
      profile: { day: 5, start: "20:00", end: "22:00" },
      appointments: [
        {
          id: "appt-current",
          interviewerUserId: AGENT,
          agentId: AGENT,
          startDateTime: "2026-08-14T20:30:00-04:00",
          endDateTime: "2026-08-14T21:00:00-04:00"
        }
      ]
    })
  });
  assert.equal(result.slots.some((slot) => slot.timeKey === "20:30"), false);
});

test("DST spring-forward compares elapsed instants, not skipped wall-clock hours", () => {
  const nowMs = Date.parse("2026-03-08T01:00:00-05:00");
  const sixtyLater = Date.parse("2026-03-08T03:00:00-04:00");
  const oneTwentyLater = Date.parse("2026-03-08T04:00:00-04:00");
  assert.equal(isSlotBookableByLeadTime(sixtyLater, nowMs, 120), false);
  assert.equal(isSlotBookableByLeadTime(oneTwentyLater, nowMs, 120), true);
  assert.equal(buildIsoTimestamp("2026-03-08", "04:00", TZ), "2026-03-08T08:00:00.000Z");
});

test("UTC stored timestamps render in the operational timezone", () => {
  const iso = "2026-08-15T00:30:00.000Z";
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
  assert.equal(label, "8:30 PM");
});

test("date-only due dates stay date-only and use the org-local today window", () => {
  const window = getOrganizationDateWindow({
    organizationId: ORG,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference: new Date("2026-08-30T16:00:00.000Z"),
    timeZoneResolution: { timeZone: TZ, source: "atlas_default" }
  });
  assert.equal(String(window.localStart).slice(0, 10), "2026-08-30");
  assert.equal(todayIsoDate(ORG, new Date("2026-08-30T16:00:00.000Z")), "2026-08-30");
});

test("manual existingBooking / skipSlotValidation paths stay in source as overrides", () => {
  const createSrc = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(createSrc, /existingBooking/);
  assert.match(createSrc, /skipSlotValidation/);
  assert.match(createSrc, /getAvailableSlots/);
});

test("lead-time exhausted today uses existing Spanish/English offer copy", () => {
  const spanish = renderCustomerReply({
    language: LANGUAGES.SPANISH,
    templateKey: "offer_available_slots",
    entities: {
      todayUnavailableAfterLead: true,
      offeredSlots: [{ date: "2026-08-15", time: "10:00", timezone: TZ }],
      now: "2026-08-14T20:23:00-04:00",
      timezone: TZ
    }
  });
  assert.match(spanish.text, /Ya no tengo horarios disponibles para hoy/);
  assert.doesNotMatch(spanish.text, /8:30|20:30/);
  const english = renderCustomerReply({
    language: LANGUAGES.ENGLISH,
    templateKey: "offer_available_slots",
    entities: {
      todayUnavailableAfterLead: true,
      offeredSlots: [{ date: "2026-08-15", time: "10:00", timezone: TZ }],
      now: "2026-08-14T20:23:00-04:00",
      timezone: TZ
    }
  });
  assert.match(english.text, /no longer have availability today/);
});

test("tenant isolation and Recruit AI intent files stay unchanged by this helper", () => {
  const engine = fs.readFileSync(
    path.join(__dirname, "../services/appointmentSchedulingEngine.js"),
    "utf8"
  );
  const helper = fs.readFileSync(path.join(__dirname, "../core/schedulingLeadTime.js"), "utf8");
  const interpreter = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/interpreter.js"),
    "utf8"
  );
  assert.match(engine, /isSlotBookableByLeadTime/);
  assert.match(helper, /BR-185/);
  assert.doesNotMatch(helper, /Team Vision/);
  assert.doesNotMatch(interpreter, /minimumBookingLeadMinutes/);
});
