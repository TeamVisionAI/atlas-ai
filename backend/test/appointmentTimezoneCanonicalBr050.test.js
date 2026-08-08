/**
 * BR-050 / BR-079 — canonical appointment wall-clock → UTC conversion.
 * Host process TZ must never define the stored instant.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildIsoTimestamp } = require("../services/availabilityService");
const { zonedTimeToUtcMs, partsInZone } = require("../core/organizationDateWindow");

const ZONE = "America/New_York";

function localPartsFromIso(iso, timeZone = ZONE) {
  return partsInZone(new Date(iso).getTime(), timeZone);
}

function assertWallClock(iso, year, month, day, hour, minute, timeZone = ZONE) {
  const parts = localPartsFromIso(iso, timeZone);
  assert.equal(parts.year, year, `year for ${iso}`);
  assert.equal(parts.month, month, `month for ${iso}`);
  assert.equal(parts.day, day, `day for ${iso}`);
  assert.equal(parts.hour, hour, `hour for ${iso}`);
  assert.equal(parts.minute, minute, `minute for ${iso}`);
}

test("EDT summer: 7:00 PM local → 23:00Z", () => {
  const iso = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
  assert.equal(iso, "2026-08-10T23:00:00.000Z");
  assertWallClock(iso, 2026, 8, 10, 19, 0);
});

test("EDT summer: 9:00 AM local → 13:00Z", () => {
  const iso = buildIsoTimestamp("2026-08-10", "09:00", ZONE);
  assert.equal(iso, "2026-08-10T13:00:00.000Z");
  assertWallClock(iso, 2026, 8, 10, 9, 0);
});

test("EST winter: 7:00 PM local → 00:00Z next day", () => {
  const iso = buildIsoTimestamp("2026-01-12", "19:00", ZONE);
  assert.equal(iso, "2026-01-13T00:00:00.000Z");
  assertWallClock(iso, 2026, 1, 12, 19, 0);
});

test("EST winter: 9:00 AM local → 14:00Z", () => {
  const iso = buildIsoTimestamp("2026-01-12", "09:00", ZONE);
  assert.equal(iso, "2026-01-12T14:00:00.000Z");
  assertWallClock(iso, 2026, 1, 12, 9, 0);
});

test("Sunday evening appointment keeps local Sunday", () => {
  // 2026-08-09 is Sunday
  const iso = buildIsoTimestamp("2026-08-09", "19:00", ZONE);
  assert.equal(iso, "2026-08-09T23:00:00.000Z");
  assertWallClock(iso, 2026, 8, 9, 19, 0);
  assert.equal(new Date(iso).getUTCDay(), 0); // Sunday UTC as well for this instant
});

test("Saturday evening appointment", () => {
  // 2026-08-08 is Saturday
  const iso = buildIsoTimestamp("2026-08-08", "19:00", ZONE);
  assert.equal(iso, "2026-08-08T23:00:00.000Z");
  assertWallClock(iso, 2026, 8, 8, 19, 0);
});

test("local date rollover when UTC falls next day (winter 7pm)", () => {
  const iso = buildIsoTimestamp("2026-01-12", "19:00", ZONE);
  assert.match(iso, /^2026-01-13T00:00:00\.000Z$/);
  // Converting back must reproduce Jan 12 7pm ET, not Jan 13.
  assertWallClock(iso, 2026, 1, 12, 19, 0);
});

test("Anthony canary wrong instant is rejected by fixed converter", () => {
  const correct = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
  const buggyHostUtcStyle = "2026-08-10T19:00:00.000Z"; // what Railway UTC host previously stored
  assert.notEqual(correct, buggyHostUtcStyle);
  assert.equal(correct, "2026-08-10T23:00:00.000Z");
  // Buggy instant formats as 3pm ET
  assertWallClock(buggyHostUtcStyle, 2026, 8, 10, 15, 0);
});

test("host TZ=UTC does not change wall→UTC result", () => {
  const previous = process.env.TZ;
  process.env.TZ = "UTC";
  try {
    // Re-require would not rebind Date; zoned converter is independent of host TZ.
    const iso = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
    assert.equal(iso, "2026-08-10T23:00:00.000Z");
  } finally {
    if (previous == null) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
});

test("schedulingService threads timezone into buildIsoTimestamp", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../services/schedulingService.js"),
    "utf8"
  );
  assert.match(src, /buildIsoTimestamp\(dateKey, timeKey, timezone\)/);
});

test("appointmentSchedulingEngine threads profile timezone into buildIsoTimestamp", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../services/appointmentSchedulingEngine.js"),
    "utf8"
  );
  assert.match(src, /buildIsoTimestamp\(dateKey, timeKey, timezone\)/);
  assert.doesNotMatch(src, /endDateObj\.getHours\(\)/);
});

test("buildIsoTimestamp no longer uses host-local Date constructor", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../services/availabilityService.js"),
    "utf8"
  );
  assert.match(src, /zonedTimeToUtcMs/);
  assert.doesNotMatch(
    src,
    /new Date\(year, month - 1, day, hour, minute/
  );
});

test("zonedTimeToUtcMs agrees with buildIsoTimestamp for matrix", () => {
  const cases = [
    ["2026-08-10", "19:00", "2026-08-10T23:00:00.000Z"],
    ["2026-08-10", "09:00", "2026-08-10T13:00:00.000Z"],
    ["2026-01-12", "19:00", "2026-01-13T00:00:00.000Z"],
    ["2026-01-12", "09:00", "2026-01-12T14:00:00.000Z"]
  ];
  for (const [dateKey, timeKey, expected] of cases) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const [hh, mm] = timeKey.split(":").map(Number);
    const ms = zonedTimeToUtcMs(y, m, d, hh, mm, 0, 0, ZONE);
    assert.equal(new Date(ms).toISOString(), expected);
    assert.equal(buildIsoTimestamp(dateKey, timeKey, ZONE), expected);
  }
});

test("default timezone is America/New_York when omitted", () => {
  assert.equal(
    buildIsoTimestamp("2026-08-10", "19:00"),
    "2026-08-10T23:00:00.000Z"
  );
});

test("end time is start + duration in UTC after wall conversion", () => {
  const startIso = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
  const endIso = new Date(
    new Date(startIso).getTime() + 30 * 60 * 1000
  ).toISOString();
  assert.equal(startIso, "2026-08-10T23:00:00.000Z");
  assert.equal(endIso, "2026-08-10T23:30:00.000Z");
  assertWallClock(endIso, 2026, 8, 10, 19, 30);
});

test("15-minute after-buffer extends beyond appointment end wall clock", () => {
  const startIso = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
  const endIso = new Date(
    new Date(startIso).getTime() + 30 * 60 * 1000
  ).toISOString();
  const bufferEndIso = new Date(
    new Date(endIso).getTime() + 15 * 60 * 1000
  ).toISOString();
  assert.equal(bufferEndIso, "2026-08-10T23:45:00.000Z");
  assertWallClock(bufferEndIso, 2026, 8, 10, 19, 45);
});

test("Calendar payload uses zoned UTC ISO + IANA timezone", async () => {
  const schedulingService = require("../services/schedulingService");
  const gcal = require("../services/googleCalendarIntegrationService");
  const capacity = require("../core/capacityEngine");

  let captured = null;
  const originalCreate = gcal.createCalendarEvent;
  const originalBook = capacity.bookSlot;
  gcal.createCalendarEvent = async (_orgId, event) => {
    captured = event;
    return { id: "gcal-tz-test" };
  };
  capacity.bookSlot = () => ({
    success: true,
    availability: { booked: 1, capacity: 2, isOpen: true }
  });

  try {
    const result = await schedulingService.scheduleAppointment({
      organizationId: "00000000-0000-4000-8000-000000000001",
      appointmentType: "interview",
      dateKey: "2026-08-10",
      timeKey: "19:00",
      duration: 30,
      timezone: ZONE,
      metadata: { prospectName: "Timezone Fixture" }
    });
    assert.equal(result.success, true);
    assert.equal(result.startTimeISO, "2026-08-10T23:00:00.000Z");
    assert.equal(result.endTimeISO, "2026-08-10T23:30:00.000Z");
    assert.equal(captured.startTimeISO, "2026-08-10T23:00:00.000Z");
    assert.equal(captured.endTimeISO, "2026-08-10T23:30:00.000Z");
    assert.equal(captured.timezone, ZONE);
  } finally {
    gcal.createCalendarEvent = originalCreate;
    capacity.bookSlot = originalBook;
  }
});

test("DB persistence shape stores absolute UTC instant + timezone field", () => {
  // Mirrors appointmentApplicationService mapping from bookingResult.
  const startTimeISO = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
  const endTimeISO = new Date(
    new Date(startTimeISO).getTime() + 30 * 60 * 1000
  ).toISOString();
  const row = {
    start_date_time: startTimeISO,
    end_date_time: endTimeISO,
    timezone: ZONE,
    duration_minutes: 30
  };
  assert.equal(row.start_date_time, "2026-08-10T23:00:00.000Z");
  assert.equal(row.timezone, "America/New_York");
  assertWallClock(row.start_date_time, 2026, 8, 10, 19, 0);
});

test("local formatting round-trip reproduces selected wall clock", () => {
  const { formatAppointmentWhen } = require("../core/appointmentConfirmationCopy");
  const startIso = buildIsoTimestamp("2026-08-10", "19:00", ZONE);
  const formatted = formatAppointmentWhen(
    { startDateTime: startIso, timezone: ZONE },
    "en"
  );
  assert.match(formatted, /7:00\s*PM/i);
  assert.doesNotMatch(formatted, /3:00\s*PM/i);
});

test("legacy CE and BR-111 share scheduleAppointment → buildIsoTimestamp path", () => {
  const ce = fs.readFileSync(
    path.join(__dirname, "../core/semanticConversationEngine.js"),
    "utf8"
  );
  const executor = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectExecutor.js"),
    "utf8"
  );
  const mission = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(ce, /executeScheduleInterview/);
  assert.match(executor, /executeScheduleInterview/);
  assert.match(mission, /scheduleAppointment/);
  assert.match(
    fs.readFileSync(path.join(__dirname, "../services/schedulingService.js"), "utf8"),
    /buildIsoTimestamp\(dateKey, timeKey, timezone\)/
  );
});
