/**
 * BR-122 — Schedule result reconciliation (tightened authoritative match).
 * Never advertise booking failure while THIS-slot active appointment remains.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyExecutionOutcomeToReply,
  applyExecutionToContext
} = require("../core/recruitAiV2/orchestrator");
const {
  executeAuthorizedSideEffects,
  appointmentMatchesRequestedSlot
} = require("../core/recruitAiV2/sideEffectExecutor");
const { REASON_CODES, V2_EXECUTABLE_ACTIONS, APPOINTMENT_STATUS, STAGES } = require("../core/recruitAiV2/constants");
const { isActiveAppointment } = require("../core/activeAppointmentResolver");
const { buildIsoTimestamp } = require("../services/availabilityService");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PHONE = "+17867527481";
const DATE = "2026-08-10";
const TIME = "20:00";
const TZ = "America/New_York";
const START_ISO = buildIsoTimestamp(DATE, TIME, TZ);

const THIS_APPT = Object.freeze({
  id: "12624b16-493b-4856-9747-fbb61bf48487",
  status: "scheduled",
  organizationId: ORG,
  agentId: AGENT,
  prospectPhone: PHONE,
  startDateTime: START_ISO,
  calendarEventId: "mnr3ja8858lghh14tugv4da2nk",
  timezone: TZ
});

const OLD_UNRELATED = Object.freeze({
  ...THIS_APPT,
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  startDateTime: buildIsoTimestamp("2026-08-03", "19:00", TZ)
});

function authGrant() {
  return {
    authorized: true,
    organizationId: ORG,
    actingUserId: AGENT,
    proposals: [{ type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT, authorized: true }]
  };
}

function baseContext() {
  return {
    organizationId: ORG,
    timezone: TZ,
    appointment: {
      proposedDate: DATE,
      proposedTime: TIME,
      previouslyOfferedSlots: [{ date: DATE, time: TIME }]
    },
    knownFacts: { preferredMeetingType: "in_person" }
  };
}

function deps(overrides = {}) {
  return {
    findActiveAppointmentForProspect: async () => null,
    getSlots: async () => ({ slots: [{ dateKey: DATE, timeKey: TIME }] }),
    executeScheduleInterview: async () => ({
      success: true,
      appointmentId: THIS_APPT.id,
      appointment: THIS_APPT
    }),
    ...overrides
  };
}

test("1. happy path normal success unchanged", async () => {
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: baseContext(),
    options: { prospectPhone: PHONE },
    dependencies: deps()
  });
  assert.equal(result.success, true);
  assert.equal(result.appointmentId, THIS_APPT.id);
  assert.equal(result.idempotent, false);
  assert.equal(result.reconciledFromCanonicalFailure, undefined);
});

test("2. downstream failure + clean rollback (no active) → failure", async () => {
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: baseContext(),
    options: { prospectPhone: PHONE },
    dependencies: deps({
      findActiveAppointmentForProspect: async () => null,
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED"
      })
    })
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, REASON_CODES.EXECUTION_CANONICAL_FAILED);
  assert.equal(isActiveAppointment({ status: "cancelled" }), false);
});

test("3. downstream failure + live THIS-slot scheduled → reconciled success", async () => {
  let lookups = 0;
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: baseContext(),
    options: { prospectPhone: PHONE },
    dependencies: deps({
      findActiveAppointmentForProspect: async () => {
        lookups += 1;
        return lookups === 1 ? null : THIS_APPT;
      },
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED"
      })
    })
  });
  assert.equal(result.success, true);
  assert.equal(result.appointmentId, THIS_APPT.id);
  assert.equal(result.reason, REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT);
  assert.equal(result.performed[0].dateKey, DATE);
  assert.equal(result.performed[0].timeKey, TIME);
  assert.equal(result.performed[0].timezone, TZ);
});

test("4. cancelled appointment does NOT reconcile", async () => {
  assert.equal(
    appointmentMatchesRequestedSlot(
      { ...THIS_APPT, status: "cancelled" },
      DATE,
      TIME,
      TZ
    ),
    false
  );

  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: baseContext(),
    options: { prospectPhone: PHONE },
    dependencies: deps({
      findActiveAppointmentForProspect: async () => {
        return null;
      },
      findAppointmentById: async () => ({ ...THIS_APPT, status: "cancelled" }),
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED",
        appointmentId: THIS_APPT.id
      })
    })
  });
  assert.equal(result.success, false);
});

test("5. unrelated active appointment (different slot) does NOT reconcile", async () => {
  assert.equal(appointmentMatchesRequestedSlot(OLD_UNRELATED, DATE, TIME, TZ), false);

  let lookups = 0;
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: baseContext(),
    options: { prospectPhone: PHONE },
    dependencies: deps({
      findActiveAppointmentForProspect: async () => {
        lookups += 1;
        return lookups === 1 ? null : OLD_UNRELATED;
      },
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED"
      })
    })
  });
  assert.equal(result.success, false);
  assert.equal(result.reason, REASON_CODES.EXECUTION_CANONICAL_FAILED);
});

test("6. replay/idempotency returns existing correct appointment (no second create)", async () => {
  let scheduleCalls = 0;
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: baseContext(),
    options: { prospectPhone: PHONE },
    dependencies: deps({
      findActiveAppointmentForProspect: async () => THIS_APPT,
      executeScheduleInterview: async () => {
        scheduleCalls += 1;
        return { success: true, appointmentId: "should-not-create" };
      }
    })
  });
  assert.equal(result.success, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.appointmentId, THIS_APPT.id);
  assert.equal(scheduleCalls, 0);
  assert.equal(result.reason, REASON_CODES.EXECUTION_IDEMPOTENT_REPLAY);
});

test("7. response never says failure while authoritative appointment remains scheduled", () => {
  assert.equal(appointmentMatchesRequestedSlot(THIS_APPT, DATE, TIME, TZ), true);

  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: {},
      customerReplyPlan: { templateKey: "ask_confirm_slot", entities: {} }
    },
    responsePlan: { templateKey: "ask_confirm_slot", entities: { requestedTime: "8:00 PM", dateLabel: "lunes" } },
    rendered: "x",
    execution: {
      attempted: true,
      success: true,
      appointmentId: THIS_APPT.id,
      reason: REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT,
      performed: [{ appointmentId: THIS_APPT.id, dateKey: DATE, timeKey: TIME, timezone: TZ }]
    }
  });
  assert.equal(applied.responsePlan.templateKey, "appointment_confirmed");
  assert.notEqual(applied.responsePlan.templateKey, "appointment_create_failed");

  const ctx = applyExecutionToContext(
    {
      timezone: TZ,
      currentStage: STAGES.PROPOSED,
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: DATE,
        proposedTime: TIME,
        appointmentId: null
      },
      conversation: {}
    },
    {
      success: true,
      appointmentId: THIS_APPT.id,
      performed: [{ dateKey: DATE, timeKey: TIME, timezone: TZ }]
    }
  );
  assert.equal(ctx.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
  assert.equal(ctx.appointment.appointmentId, THIS_APPT.id);
  assert.equal(ctx.appointment.proposedDate, DATE);
  assert.equal(ctx.appointment.proposedTime, TIME);
  assert.equal(ctx.appointment.confirmedDate, DATE);
  assert.equal(ctx.appointment.confirmedTime, TIME);
  assert.equal(ctx.timezone, TZ);
  assert.equal(ctx.currentStage, STAGES.CONFIRMED);
});

test("BR-122 docs + cancelled/match helpers", () => {
  const fs = require("node:fs");
  const rules = fs.readFileSync("docs/06-business/BUSINESS_RULES.md", "utf8");
  assert.match(rules, /## BR-122/);
  assert.match(rules, /Authoritative match/);
  assert.match(rules, /Occupation unchanged/);
  assert.equal(isActiveAppointment({ status: "scheduled" }), true);
  assert.equal(isActiveAppointment({ status: "cancelled" }), false);
});
