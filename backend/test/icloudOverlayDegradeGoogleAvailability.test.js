/**
 * Optional iCloud overlay must not zero recruiting availability when
 * the authoritative Google calendar is healthy (BR-161).
 */

"use strict";

require("dotenv").config({ quiet: true });
process.env.META_TOKEN_ENCRYPTION_KEY =
  process.env.META_TOKEN_ENCRYPTION_KEY || "a".repeat(64);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getAvailableSlots } = require("../services/appointmentSchedulingEngine");
const {
  PROVIDERS,
  createAvailabilityAuthError,
  createAvailabilityUnavailableError
} = require("../core/availability/availabilityTypes");

const VISIONARIES_ORG = "aa045173-5eee-4c6e-978c-cc2f6125be29";
const MILLER = "d2bb9459-371b-41f3-8825-588cb8b04d7b";
const TV_ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const WEDNESDAY = "2026-09-09";
const NOW_MS = Date.parse("2026-09-04T15:00:00-04:00");

function weekSchedule() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek === 3,
    blocks: dayOfWeek === 3 ? [{ start: "12:15", end: "21:00" }] : []
  }));
}

function profile() {
  return {
    appointmentProfile: {
      workingSchedule: weekSchedule(),
      defaults: {
        defaultDurationMinutes: 30,
        recruitingInterviewDurationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumBookingLeadMinutes: 0,
        timezone: "America/New_York"
      }
    },
    timezone: "America/New_York"
  };
}

function toRanges(periods, source) {
  return periods.map((period) => ({
    start: Date.parse(period.start),
    end: Date.parse(period.end),
    source
  }));
}

function googleError(code) {
  const error = new Error(code);
  error.publicCode = code;
  error.code = code;
  return error;
}

async function slotsFor({
  organizationId = VISIONARIES_ORG,
  agentId = MILLER,
  googleBusy = [],
  icloudBusy = [],
  googleThrow = null,
  icloudThrow = null,
  timePreference = "afternoon",
  queriedOrgs = null
} = {}) {
  return getAvailableSlots({
    agentId,
    organizationId,
    date: WEDNESDAY,
    purpose: "recruiting_interview",
    durationMinutes: 30,
    timePreference,
    maxResults: 50,
    dependencies: {
      nowMs: NOW_MS,
      getAppointmentProfileFn: async () => profile(),
      getSchedulingSettingsFn: async () => ({ respectPersonalCalendar: true }),
      searchAppointmentsFn: async () => ({ items: [] }),
      queryFreeBusyFn: async (orgId) => {
        if (queriedOrgs) {
          queriedOrgs.push(orgId);
        }
        if (googleThrow) {
          throw googleThrow;
        }
        return toRanges(googleBusy, PROVIDERS.GOOGLE_CALENDAR);
      },
      queryIcloudBusyFn: async () => {
        if (icloudThrow) {
          throw icloudThrow;
        }
        return Array.isArray(icloudBusy)
          ? toRanges(icloudBusy, PROVIDERS.ICLOUD_CALENDAR)
          : icloudBusy();
      }
    }
  });
}

test("A) Google healthy + iCloud healthy => combined availability", async () => {
  const result = await slotsFor({
    googleBusy: [{ start: "2026-09-09T16:15:00.000Z", end: "2026-09-09T16:45:00.000Z" }],
    icloudBusy: [{ start: "2026-09-09T17:15:00.000Z", end: "2026-09-09T17:45:00.000Z" }]
  });
  const keys = result.slots.map((slot) => slot.timeKey);
  assert.ok(keys.length > 0);
  assert.equal(keys.includes("12:15"), false);
  assert.equal(keys.includes("13:15"), false);
  assert.equal(keys.includes("12:45"), true);
  assert.equal(result.icloudOverlaySkippedReason, null);
});

test("B) Google healthy + iCloud ICLOUD_RECONNECT_REQUIRED => Google-only slots", async () => {
  const result = await slotsFor({
    googleBusy: [{ start: "2026-09-09T16:15:00.000Z", end: "2026-09-09T16:45:00.000Z" }],
    icloudThrow: createAvailabilityAuthError("ICLOUD_RECONNECT_REQUIRED")
  });
  const keys = result.slots.map((slot) => slot.timeKey);
  assert.ok(keys.length > 0, "iCloud overlay failure must not zero slots");
  assert.equal(keys.includes("12:15"), false);
  assert.equal(keys.includes("12:45"), true);
  assert.equal(result.availabilityBlockedReason, undefined);
  assert.equal(result.icloudOverlaySkippedReason, "ICLOUD_RECONNECT_REQUIRED");
});

test("C) Google healthy + no iCloud connection => normal availability", async () => {
  const result = await slotsFor({
    googleBusy: [],
    icloudBusy: []
  });
  assert.ok(result.slots.length > 0);
  assert.equal(result.icloudOverlaySkippedReason, null);
  assert.equal(result.availabilityBlockedReason, undefined);
});

test("D) Google unavailable => fail safe, do not invent availability", async () => {
  const result = await slotsFor({
    googleThrow: googleError("GOOGLE_RECONNECT_REQUIRED"),
    icloudBusy: []
  });
  assert.deepEqual(result.slots, []);
  assert.equal(result.availabilityBlockedReason, "GOOGLE_RECONNECT_REQUIRED");
});

test("E) Wednesday 12:15–9PM afternoon request yields slots when Google is free", async () => {
  const result = await slotsFor({
    icloudThrow: createAvailabilityUnavailableError("ICLOUD_UNAVAILABLE")
  });
  const keys = result.slots.map((slot) => slot.timeKey);
  assert.ok(keys.includes("12:15") || keys.includes("12:45"));
  assert.ok(keys.some((key) => key >= "12:15" && key < "18:00"));
  assert.equal(
    keys.every((key) => key >= "12:01" && key < "18:00"),
    true
  );
});

test("F) no cross-tenant calendar leakage", async () => {
  const queriedOrgs = [];
  await slotsFor({
    organizationId: VISIONARIES_ORG,
    queriedOrgs,
    googleBusy: []
  });
  assert.deepEqual(queriedOrgs, [VISIONARIES_ORG]);
  assert.equal(queriedOrgs.includes(OTHER_ORG), false);
  assert.equal(queriedOrgs.includes(TV_ORG), false);
});

test("G) no iCloud writes", () => {
  const engine = fs.readFileSync(
    path.join(__dirname, "../services/appointmentSchedulingEngine.js"),
    "utf8"
  );
  const provider = fs.readFileSync(
    path.join(__dirname, "../core/availability/icloudAvailabilityProvider.js"),
    "utf8"
  );
  assert.doesNotMatch(engine, /createCalendarEvent|updateCalendarEvent|deleteCalendarEvent/);
  assert.doesNotMatch(provider, /PUT |POST |WRITE|createEvent/);
  assert.match(engine, /icloud_overlay_skipped/);
});

test("docs: BR-161 overlay degrades when iCloud auth fails", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-161/);
  assert.match(rules, /Optional overlay degrades/);
  assert.match(rules, /ICLOUD_RECONNECT_REQUIRED/);
});
