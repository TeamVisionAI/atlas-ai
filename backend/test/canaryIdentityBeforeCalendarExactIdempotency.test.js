/**
 * Canary hardening after BR-120 readiness audit (PR #87):
 * 1) executeScheduleInterview resolves identity BEFORE Calendar create
 * 2) pre-create idempotency requires exact-slot + org/agent/(prospect) scope
 * 3) active different-slot → EXECUTION_ACTIVE_SLOT_CONFLICT (no schedule)
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
const { applyExecutionOutcomeToReply } = require("../core/recruitAiV2/orchestrator");
const { buildIsoTimestamp } = require("../services/availabilityService");
const {
  executeScheduleInterview
} = require("../application/missionExecutionApplicationService");
const {
  resolveCanonicalProspectIdentity,
  clearProspectBridgeCacheForTests,
  REASON_CODES: IDENTITY_CODES
} = require("../core/recruitingProspectBridge");

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_AGENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CORE_PROSPECT = "a257b152-43ea-401f-8de3-783b997013ff";
const OTHER_PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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
    prospectId: CORE_PROSPECT,
    appointment: {
      proposedDate: DATE,
      proposedTime: TIME,
      previouslyOfferedSlots: [{ date: DATE, time: TIME, timezone: TZ }]
    },
    knownFacts: { preferredMeetingType: "in_person" },
    ...overrides
  };
}

function scopedActive(overrides = {}) {
  return {
    id: "appt-same-slot",
    status: "scheduled",
    organizationId: ORG,
    agentId: AGENT,
    prospectId: CORE_PROSPECT,
    startDateTime: START_ISO,
    ...overrides
  };
}

function scheduleInjectedOptions(identityResult, calendarCalls) {
  return {
    organizationId: ORG,
    agentId: AGENT,
    userId: AGENT,
    dependencies: {
      resolveTenantProspect: async () => ({
        id: "legacy-prospect",
        phone: PHONE,
        name: "Anthony",
        city: "Miami",
        state: "FL",
        notes: "EMAIL:anthony@example.com"
      }),
      resolveInterviewLocation: async () => ({
        configured: true,
        location: "Team Vision Office",
        meetingUrl: null
      }),
      resolveCanonicalProspectIdentity: async () => identityResult,
      scheduleAppointment: async () => {
        calendarCalls.count += 1;
        return { success: true, eventId: "should-not-create" };
      }
    }
  };
}

const SCHEDULE_PAYLOAD = {
  dateKey: DATE,
  timeKey: TIME,
  interviewType: "In Person",
  timezone: TZ
};

test("1. source order: identity resolve before scheduleAppt Calendar call", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  const identityIdx = src.indexOf("const identity = await resolveIdentity({");
  const calendarIdx = src.indexOf("bookingResult = await scheduleAppt({");
  assert.ok(identityIdx > 0, "resolveIdentity call missing");
  assert.ok(calendarIdx > identityIdx, "Calendar must follow identity");
  assert.match(src, /canonical core identity must resolve BEFORE Calendar create/);
});

test("2. runtime: identity fail-closed paths never call Calendar", async () => {
  clearProspectBridgeCacheForTests();
  const failCases = [
    {
      name: "unresolved",
      result: { ok: false, reasonCode: IDENTITY_CODES.UNRESOLVED, coreProspectId: null }
    },
    {
      name: "org_mismatch",
      result: {
        ok: false,
        reasonCode: IDENTITY_CODES.ORG_MISMATCH,
        coreProspectId: null
      }
    },
    {
      name: "ambiguous",
      result: { ok: false, reasonCode: IDENTITY_CODES.AMBIGUOUS, coreProspectId: null }
    },
    {
      name: "ensure_failed",
      result: {
        ok: false,
        reasonCode: IDENTITY_CODES.ENSURE_FAILED,
        coreProspectId: null
      }
    }
  ];

  for (const { name, result } of failCases) {
    const calendarCalls = { count: 0 };
    const outcome = await executeScheduleInterview(
      PHONE,
      SCHEDULE_PAYLOAD,
      scheduleInjectedOptions(result, calendarCalls)
    );
    assert.equal(calendarCalls.count, 0, `${name}: Calendar must not run`);
    assert.equal(outcome.success, false, `${name}: must fail closed`);
    assert.equal(
      outcome.error || outcome.code || outcome.reason,
      result.reasonCode,
      `${name}: reason code`
    );
  }

  // Unit path still documents unresolved without Calendar involvement
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

test("3. A–F exact-slot match + executor conflict semantics", async () => {
  const scope = { organizationId: ORG, agentId: AGENT, prospectId: CORE_PROSPECT };

  // A. exact active same slot → match
  assert.equal(
    appointmentMatchesRequestedSlot(scopedActive(), DATE, TIME, TZ, scope),
    true,
    "A exact match"
  );

  // B. active different time same day → no match
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({ startDateTime: buildIsoTimestamp(DATE, "19:00", TZ) }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "B different time same day"
  );

  // C. active different day same time → no match
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({ startDateTime: buildIsoTimestamp("2026-08-12", TIME, TZ) }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "C different day same time"
  );

  // D. cancelled exact slot → not reusable
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({ status: "cancelled" }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "D cancelled"
  );

  // E. unrelated active (wrong start) → not reusable
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({
        id: "unrelated",
        startDateTime: buildIsoTimestamp("2026-08-03", "19:00", TZ)
      }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "E unrelated"
  );

  // F. same phone other org → never reusable
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({ organizationId: OTHER_ORG }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "F other org"
  );

  // Wrong agent / wrong prospect also fail closed when scoped
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({ agentId: OTHER_AGENT }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "wrong agent"
  );
  assert.equal(
    appointmentMatchesRequestedSlot(
      scopedActive({ prospectId: OTHER_PROSPECT }),
      DATE,
      TIME,
      TZ,
      scope
    ),
    false,
    "wrong prospect"
  );

  // Executor A: exact match → idempotent success, no schedule
  {
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
        prospectId: CORE_PROSPECT,
        inboundMessageId: "msg-match"
      },
      dependencies: {
        findActiveAppointmentForProspect: async () => scopedActive(),
        executeScheduleInterview: async () => {
          scheduleCalls += 1;
          throw new Error("must-not-schedule");
        },
        getSlots: async () => [{ dateKey: DATE, timeKey: TIME }]
      }
    });
    assert.equal(scheduleCalls, 0);
    assert.equal(result.success, true);
    assert.equal(result.idempotent, true);
    assert.equal(result.reason, REASON_CODES.EXECUTION_IDEMPOTENT_REPLAY);
  }

  // Executor B/C: active different slot → conflict, no Calendar/schedule, fail reply
  {
    const otherSlot = scopedActive({
      id: "appt-other-slot",
      startDateTime: buildIsoTimestamp(DATE, "19:00", TZ)
    });
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
        prospectId: CORE_PROSPECT,
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

    const applied = applyExecutionOutcomeToReply({
      structuredDecision: { customerReplyPlan: { templateKey: "appointment_confirmed" } },
      responsePlan: { templateKey: "appointment_confirmed", entities: {} },
      rendered: "confirmed",
      execution: result
    });
    assert.equal(applied.responsePlan.templateKey, "appointment_create_failed");
    assert.notEqual(applied.responsePlan.templateKey, "appointment_confirmed");
  }
});

test("4. happy path still schedules when identity ok and no active conflict", async () => {
  let scheduleCalls = 0;
  const createdId = "appt-fresh-1";
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
      prospectId: CORE_PROSPECT,
      inboundMessageId: "msg-happy"
    },
    dependencies: {
      findActiveAppointmentForProspect: async () => null,
      executeScheduleInterview: async () => {
        scheduleCalls += 1;
        return {
          success: true,
          appointmentId: createdId,
          appointment: scopedActive({ id: createdId })
        };
      },
      getSlots: async () => [{ dateKey: DATE, timeKey: TIME }]
    }
  });
  assert.equal(scheduleCalls, 1);
  assert.equal(result.success, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.appointmentId, createdId);

  const applied = applyExecutionOutcomeToReply({
    structuredDecision: { customerReplyPlan: {} },
    responsePlan: { templateKey: "offer_slots", entities: {} },
    rendered: "offer",
    execution: result
  });
  assert.equal(applied.responsePlan.templateKey, "appointment_confirmed");
});

test("5. BR-121/122 interaction: reconcile only same-slot active after failure", async () => {
  // Clean rollback (no active) → failure remains failure
  {
    const result = await executeAuthorizedSideEffects({
      authorization: authGrant(),
      structuredDecision: {},
      context: baseContext(),
      options: { prospectPhone: PHONE, prospectId: CORE_PROSPECT },
      dependencies: {
        findActiveAppointmentForProspect: async () => null,
        getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
        executeScheduleInterview: async () => ({
          success: false,
          error: "WORKFLOW_ADVANCE_FAILED"
        })
      }
    });
    assert.equal(result.success, false);
    assert.equal(result.reason, REASON_CODES.EXECUTION_CANONICAL_FAILED);
    assert.equal(result.reconciledFromCanonicalFailure, undefined);
  }

  // Failure + leftover same-slot active → BR-122 reconcile success
  {
    let lookups = 0;
    const result = await executeAuthorizedSideEffects({
      authorization: authGrant(),
      structuredDecision: {},
      context: baseContext(),
      options: { prospectPhone: PHONE, prospectId: CORE_PROSPECT },
      dependencies: {
        findActiveAppointmentForProspect: async () => {
          lookups += 1;
          return lookups === 1 ? null : scopedActive();
        },
        getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
        executeScheduleInterview: async () => ({
          success: false,
          error: "WORKFLOW_ADVANCE_FAILED"
        })
      }
    });
    assert.equal(result.success, true);
    assert.equal(result.reason, REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT);
    assert.equal(result.reconciledFromCanonicalFailure, true);
  }
});
