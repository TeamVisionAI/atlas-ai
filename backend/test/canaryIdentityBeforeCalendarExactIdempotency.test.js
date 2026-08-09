/**
 * Canary hardening after BR-120 readiness audit:
 * 1) executeScheduleInterview resolves identity BEFORE Calendar create
 * 2) pre-create idempotency requires exact-slot match (not any active)
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  executeAuthorizedSideEffects,
  appointmentMatchesRequestedSlot
} = require("../core/recruitAiV2/sideEffectExecutor");
const { REASON_CODES, V2_EXECUTABLE_ACTIONS } = require("../core/recruitAiV2/constants");
const { buildIsoTimestamp } = require("../services/availabilityService");
const {
  resolveCanonicalProspectIdentity,
  clearProspectBridgeCacheForTests,
  REASON_CODES: IDENTITY_CODES
} = require("../core/recruitingProspectBridge");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PHONE = "+17867527481";
const DATE = "2026-08-11";
const TIME = "20:00";
const TZ = "America/New_York";
const START_ISO = buildIsoTimestamp(DATE, TIME, TZ);

function authGrant() {
  return {
    authorized: true,
    organizationId: ORG,
    actingUserId: AGENT,
    proposals: [{ type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT, authorized: true }]
  };
}

function baseContext(overrides = {}) {
  return {
    organizationId: ORG,
    timezone: TZ,
    prospectPhone: PHONE,
    appointment: {
      proposedDate: DATE,
      proposedTime: TIME,
      previouslyOfferedSlots: [{ date: DATE, time: TIME, timezone: TZ }]
    },
    knownFacts: { preferredMeetingType: "in_person" },
    ...overrides
  };
}

test("mission path: identity resolve appears before scheduleAppointment Calendar call", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  const identityIdx = src.indexOf("resolveCanonicalProspectIdentity");
  const calendarIdx = src.indexOf("bookingResult = await scheduleAppointment({");
  assert.ok(identityIdx > 0);
  assert.ok(calendarIdx > identityIdx);
  assert.match(src, /canonical core identity must resolve BEFORE Calendar create/);
});

test("mission path: unresolved identity fail-closed does not require Calendar", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG,
    ensureCore: false,
    listInOrg: async () => [],
    listAnyOrg: async () => []
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, IDENTITY_CODES.UNRESOLVED);
});

test("idempotent replay only when active appointment matches exact slot", async () => {
  const matching = {
    id: "appt-same-slot",
    status: "scheduled",
    organizationId: ORG,
    startDateTime: START_ISO
  };
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {
      decision: { nextAction: "create_appointment", mayCreateAppointment: true }
    },
    context: baseContext(),
    options: {
      organizationId: ORG,
      actingUserId: AGENT,
      prospectPhone: PHONE,
      inboundMessageId: "msg-match"
    },
    dependencies: {
      findActiveAppointmentForProspect: async () => matching,
      executeScheduleInterview: async () => {
        throw new Error("must-not-schedule");
      },
      getSlots: async () => [{ dateKey: DATE, timeKey: TIME }]
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.reason, REASON_CODES.EXECUTION_IDEMPOTENT_REPLAY);
  assert.equal(result.appointmentId, matching.id);
});

test("active appointment for different slot is NOT treated as successful booking", async () => {
  const otherSlot = {
    id: "appt-other-slot",
    status: "scheduled",
    organizationId: ORG,
    startDateTime: buildIsoTimestamp("2026-08-03", "19:00", TZ)
  };
  let scheduleCalls = 0;
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {
      decision: { nextAction: "create_appointment", mayCreateAppointment: true }
    },
    context: baseContext(),
    options: {
      organizationId: ORG,
      actingUserId: AGENT,
      prospectPhone: PHONE,
      inboundMessageId: "msg-conflict"
    },
    dependencies: {
      findActiveAppointmentForProspect: async () => otherSlot,
      executeScheduleInterview: async () => {
        scheduleCalls += 1;
        return { success: true, appointmentId: "should-not" };
      },
      getSlots: async () => [{ dateKey: DATE, timeKey: TIME }]
    }
  });

  assert.equal(scheduleCalls, 0);
  assert.equal(result.success, false);
  assert.equal(result.reason, REASON_CODES.EXECUTION_ACTIVE_SLOT_CONFLICT);
  assert.equal(result.appointmentId, otherSlot.id);
  assert.ok(
    result.failed.some((f) => f.reason === REASON_CODES.EXECUTION_ACTIVE_SLOT_CONFLICT)
  );
});

test("appointmentMatchesRequestedSlot helper rejects unrelated actives", () => {
  assert.equal(
    appointmentMatchesRequestedSlot(
      {
        id: "x",
        status: "scheduled",
        startDateTime: buildIsoTimestamp("2026-08-03", "19:00", TZ)
      },
      DATE,
      TIME,
      TZ
    ),
    false
  );
  assert.equal(
    appointmentMatchesRequestedSlot(
      { id: "y", status: "scheduled", startDateTime: START_ISO },
      DATE,
      TIME,
      TZ
    ),
    true
  );
});
