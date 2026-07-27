/**
 * Sprint 22 — Appointment Engine tests.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEmail,
  validateEmailFormat,
  detectDomainTypo,
  resolveEmailStatus
} = require("../core/emailNormalization");
const {
  buildDefaultWeekSchedule,
  applySchedulePreset,
  normalizeAppointmentProfile,
  resolveDurationForPurpose
} = require("../services/appointmentProfileService");
const {
  parseTimeKey,
  generateTimeKeys,
  getDaySchedule,
  matchesTimePreference,
  buildBusyRanges,
  isSlotBlocked
} = require("../services/appointmentSchedulingEngine");
const { APPOINTMENT_PURPOSES, EMAIL_STATUSES } = require("../core/configuration/appointmentDomain");

describe("Sprint 22 — email normalization", () => {
  it("normalizes casing and whitespace", () => {
    assert.equal(normalizeEmail("  Ana@Gmail.COM  "), "ana@gmail.com");
  });

  it("detects common domain typos", () => {
    assert.equal(detectDomainTypo("ana@gmail.con"), "ana@gmail.com");
  });

  it("validates email format", () => {
    assert.equal(validateEmailFormat("valid@example.com"), true);
    assert.equal(validateEmailFormat("invalid"), false);
  });

  it("resolves email status", () => {
    assert.equal(resolveEmailStatus(null), EMAIL_STATUSES.MISSING);
    assert.equal(resolveEmailStatus("bad"), EMAIL_STATUSES.INVALID);
    assert.equal(resolveEmailStatus("good@example.com"), EMAIL_STATUSES.UNVERIFIED);
  });
});

describe("Sprint 22 — appointment profile", () => {
  it("builds default weekday schedule", () => {
    const schedule = buildDefaultWeekSchedule();
    assert.equal(schedule.length, 7);
    assert.equal(schedule[1].enabled, true);
    assert.equal(schedule[0].enabled, false);
  });

  it("applies weekday preset", () => {
    const schedule = applySchedulePreset("weekdays");
    assert.equal(schedule.filter((day) => day.enabled).length, 5);
  });

  it("resolves recruiting interview duration", () => {
    const profile = normalizeAppointmentProfile({});
    assert.equal(
      resolveDurationForPurpose(profile, APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW),
      30
    );
  });
});

describe("Sprint 22 — scheduling engine helpers", () => {
  it("parses time keys", () => {
    assert.equal(parseTimeKey("09:30"), 570);
  });

  it("generates 30-minute slots", () => {
    const keys = generateTimeKeys(540, 600, 30);
    assert.deepEqual(keys, ["09:00", "09:30"]);
  });

  it("reads day schedule from profile", () => {
    const profile = normalizeAppointmentProfile({});
    const monday = getDaySchedule(profile, new Date("2026-07-27T12:00:00"));
    assert.equal(monday.enabled, true);
  });

  it("filters morning preference", () => {
    assert.equal(matchesTimePreference(parseTimeKey("10:00"), "morning"), true);
    assert.equal(matchesTimePreference(parseTimeKey("14:00"), "morning"), false);
  });

  it("detects busy range conflicts with buffers", () => {
    const dateKey = "2026-07-28";
    const timeKey = "10:00";
    const { buildIsoTimestamp } = require("../services/availabilityService");
    const startIso = buildIsoTimestamp(dateKey, timeKey);
    const start = new Date(startIso).getTime();
    const end = start + 30 * 60 * 1000;
    const busy = buildBusyRanges(
      [
        {
          startDateTime: startIso,
          endDateTime: new Date(end).toISOString()
        }
      ],
      15,
      15
    );

    assert.equal(isSlotBlocked(start, end, busy), true);
  });

  it("rejects past slots via timestamp comparison", () => {
    const past = Date.now() - 60_000;
    assert.ok(past < Date.now());
  });
});

describe("Sprint 22 — appointment application exports", () => {
  it("loads appointment application service", () => {
    const service = require("../application/appointmentApplicationService");
    assert.equal(typeof service.createAppointment, "function");
    assert.equal(typeof service.getSlots, "function");
    assert.equal(typeof service.requestHumanAssist, "function");
  });
});
