/**
 * BR-122 — Schedule result reconciliation.
 * Never advertise booking failure while an active appointment remains.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyExecutionOutcomeToReply
} = require("../core/recruitAiV2/orchestrator");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { REASON_CODES, V2_EXECUTABLE_ACTIONS } = require("../core/recruitAiV2/constants");
const { isActiveAppointment } = require("../core/activeAppointmentResolver");

const ANTHONY_ORPHAN = Object.freeze({
  id: "12624b16-493b-4856-9747-fbb61bf48487",
  status: "scheduled",
  organizationId: "00000000-0000-4000-8000-000000000001",
  prospectPhone: "+17867527481",
  startDateTime: "2026-08-11T00:00:00.000Z",
  calendarEventId: "mnr3ja8858lghh14tugv4da2nk"
});

function authGrant(overrides = {}) {
  return {
    authorized: true,
    organizationId: ANTHONY_ORPHAN.organizationId,
    actingUserId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    proposals: [
      {
        type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
        authorized: true
      }
    ],
    ...overrides
  };
}

test("BR-122 isActiveAppointment treats scheduled as active and cancelled as terminal", () => {
  assert.equal(isActiveAppointment({ status: "scheduled" }), true);
  assert.equal(isActiveAppointment({ status: "cancelled" }), false);
});

test("BR-122 sideEffectExecutor reconciles canonical failure when active appointment remains", async () => {
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: {
      organizationId: ANTHONY_ORPHAN.organizationId,
      timezone: "America/New_York",
      appointment: {
        proposedDate: "2026-08-10",
        proposedTime: "20:00",
        previouslyOfferedSlots: [{ date: "2026-08-10", time: "20:00" }]
      },
      knownFacts: { preferredMeetingType: "in_person" }
    },
    options: { prospectPhone: ANTHONY_ORPHAN.prospectPhone },
    dependencies: {
      findActiveAppointmentForProspect: async () => null,
      getSlots: async () => ({
        slots: [{ dateKey: "2026-08-10", timeKey: "20:00" }]
      }),
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED",
        message: "Unable to advance workflow after scheduling."
      })
    }
  });

  // First call used findActive=null before write; after failure we need a second path.
  // Re-run with post-failure orphan present via custom dep that returns null then orphan.
  let lookupCount = 0;
  const reconciled = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: {
      organizationId: ANTHONY_ORPHAN.organizationId,
      timezone: "America/New_York",
      appointment: {
        proposedDate: "2026-08-10",
        proposedTime: "20:00",
        previouslyOfferedSlots: [{ date: "2026-08-10", time: "20:00" }]
      },
      knownFacts: { preferredMeetingType: "in_person" }
    },
    options: { prospectPhone: ANTHONY_ORPHAN.prospectPhone },
    dependencies: {
      findActiveAppointmentForProspect: async () => {
        lookupCount += 1;
        // Pre-create idempotency check: none. Post-failure reconcile: orphan.
        return lookupCount === 1 ? null : ANTHONY_ORPHAN;
      },
      getSlots: async () => ({
        slots: [{ dateKey: "2026-08-10", timeKey: "20:00" }]
      }),
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED",
        message: "Unable to advance workflow after scheduling."
      })
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, REASON_CODES.EXECUTION_CANONICAL_FAILED);

  assert.equal(reconciled.success, true);
  assert.equal(reconciled.appointmentId, ANTHONY_ORPHAN.id);
  assert.equal(
    reconciled.reason,
    REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT
  );
  assert.equal(reconciled.reconciledFromCanonicalFailure, true);
  assert.equal(reconciled.failed.length, 0);
  assert.equal(lookupCount, 2);
});

test("BR-122 clean failure (no active appt) stays failure — no false success", async () => {
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: {
      organizationId: ANTHONY_ORPHAN.organizationId,
      timezone: "America/New_York",
      appointment: {
        proposedDate: "2026-08-10",
        proposedTime: "20:00",
        previouslyOfferedSlots: [{ date: "2026-08-10", time: "20:00" }]
      }
    },
    options: { prospectPhone: ANTHONY_ORPHAN.prospectPhone },
    dependencies: {
      findActiveAppointmentForProspect: async () => null,
      getSlots: async () => ({
        slots: [{ dateKey: "2026-08-10", timeKey: "20:00" }]
      }),
      executeScheduleInterview: async () => ({
        success: false,
        error: "WORKFLOW_ADVANCE_FAILED"
      })
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, REASON_CODES.EXECUTION_CANONICAL_FAILED);
});

test("BR-122 orchestrator: reconciled success uses appointment_confirmed not create_failed", () => {
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: {},
      customerReplyPlan: { templateKey: "ask_confirm_slot", entities: {} }
    },
    responsePlan: { templateKey: "ask_confirm_slot", entities: {} },
    rendered: "x",
    execution: {
      attempted: true,
      success: true,
      appointmentId: ANTHONY_ORPHAN.id,
      reason: REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT,
      performed: [{ appointmentId: ANTHONY_ORPHAN.id }]
    }
  });

  assert.equal(applied.responsePlan.templateKey, "appointment_confirmed");
  assert.notEqual(applied.responsePlan.templateKey, "appointment_create_failed");
});

test("BR-122 orchestrator: true failure still uses appointment_create_failed", () => {
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: {},
      customerReplyPlan: { templateKey: "ask_confirm_slot", entities: {} }
    },
    responsePlan: { templateKey: "ask_confirm_slot", entities: {} },
    rendered: "x",
    execution: {
      attempted: true,
      success: false,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      failed: [{ type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT }]
    }
  });

  assert.equal(applied.responsePlan.templateKey, "appointment_create_failed");
});

test("BR-122 mission path: rollback leaving cancelled stays failure (unit contract)", async () => {
  // Contract: cancelled after rollback is not active → failure path is correct.
  assert.equal(isActiveAppointment({ status: "cancelled", id: ANTHONY_ORPHAN.id }), false);
});

test("BR-122 docs + reason code exist", () => {
  const fs = require("node:fs");
  const rules = fs.readFileSync("docs/06-business/BUSINESS_RULES.md", "utf8");
  assert.match(rules, /## BR-122/);
  assert.equal(
    REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT,
    "EXECUTION_RECONCILED_ACTIVE_APPOINTMENT"
  );
});
