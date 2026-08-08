/**
 * Recruit AI v2 — SideEffectExecutor (BR-111).
 *
 * Translates an authorized v2 action into a canonical Atlas application service call.
 * Does NOT own appointment lifecycle, Calendar, WhatsApp, or prospect writes.
 *
 * First canary surface: confirmed create_appointment only →
 * missionExecutionApplicationService.executeScheduleInterview (BR-049 / BR-050).
 */

const { REASON_CODES, V2_EXECUTABLE_ACTIONS } = require("./constants");

function resolveProspectPhone({ context, options } = {}) {
  return (
    options?.prospectPhone ||
    options?.phone ||
    context?.prospectPhone ||
    context?.phone ||
    context?.identity?.phone ||
    context?.prospect?.phone ||
    null
  );
}

function resolveConfirmedSlot({ context, structuredDecision } = {}) {
  const offered = Array.isArray(context?.appointment?.previouslyOfferedSlots)
    ? context.appointment.previouslyOfferedSlots
    : [];
  const entities = structuredDecision?.entities || {};
  const replyEntities = structuredDecision?.customerReplyPlan?.entities || {};

  let dateKey =
    context?.appointment?.proposedDate ||
    entities.requestedDate ||
    replyEntities.requestedDate ||
    null;
  let timeKey =
    context?.appointment?.proposedTime ||
    entities.requestedTime ||
    replyEntities.requestedTime ||
    null;

  // Single offered slot confirm (BR-108) may leave proposed* sparsely seeded.
  if ((!dateKey || !timeKey) && offered.length === 1) {
    dateKey = dateKey || offered[0].date || offered[0].dateKey || null;
    timeKey = timeKey || offered[0].time || offered[0].timeKey || null;
  }

  if (dateKey && timeKey && offered.length > 0) {
    const match = offered.find((slot) => {
      const d = slot.date || slot.dateKey;
      const t = slot.time || slot.timeKey;
      return String(d) === String(dateKey) && String(t) === String(timeKey);
    });
    if (match) {
      dateKey = match.date || match.dateKey || dateKey;
      timeKey = match.time || match.timeKey || timeKey;
    }
  }

  return { dateKey, timeKey };
}

function resolveInterviewType(context = {}) {
  const preferred = String(
    context?.knownFacts?.preferredMeetingType ||
      context?.appointment?.meetingType ||
      "zoom"
  ).toLowerCase();
  if (preferred === "in_person" || preferred === "office") {
    return "In Person";
  }
  if (preferred.includes("public")) {
    return "Public Location";
  }
  return "Zoom";
}

function slotsInclude(slots, dateKey, timeKey) {
  if (!Array.isArray(slots) || !dateKey || !timeKey) {
    return false;
  }
  return slots.some((slot) => {
    const d = slot.dateKey || slot.date;
    const t = slot.timeKey || slot.time;
    return String(d) === String(dateKey) && String(t) === String(timeKey);
  });
}

/**
 * Execute authorized side effects. Call only after SideEffectAuthorizer grants.
 * Re-authorizes nothing itself — caller must re-authorize immediately before this.
 */
async function executeAuthorizedSideEffects({
  authorization,
  structuredDecision,
  context,
  options = {},
  dependencies = {}
} = {}) {
  const performed = [];
  const failed = [];
  const skipped = [];

  if (!authorization?.authorized) {
    return {
      attempted: false,
      performed,
      failed,
      skipped: (authorization?.proposals || []).map((p) => p.type),
      success: false,
      reason: REASON_CODES.EXECUTION_DENIED
    };
  }

  const createProposal = (authorization.proposals || []).find(
    (p) => p.type === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT && p.authorized
  );

  if (!createProposal) {
    return {
      attempted: false,
      performed,
      failed,
      skipped: (authorization.proposals || []).map((p) => p.type),
      success: false,
      reason: REASON_CODES.EXECUTION_UNSUPPORTED_ACTION
    };
  }

  const organizationId = authorization.organizationId || context?.organizationId || null;
  const agentId = authorization.actingUserId || null;
  const phone = resolveProspectPhone({ context, options });
  const { dateKey, timeKey } = resolveConfirmedSlot({ context, structuredDecision });
  const inboundMessageId =
    options.inboundMessageId ||
    options.messageId ||
    null;

  if (!organizationId || !agentId || !phone || !dateKey || !timeKey) {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_DENIED,
      detail: "missing_execution_scope_or_slot"
    });
    return {
      attempted: true,
      performed,
      failed,
      skipped,
      success: false,
      reason: REASON_CODES.EXECUTION_DENIED
    };
  }

  const findActive =
    dependencies.findActiveAppointmentForProspect ||
    ((phoneArg, orgId, agent) =>
      require("../activeAppointmentResolver").findActiveAppointmentForProspect(
        phoneArg,
        orgId,
        agent
      ));
  const getSlots =
    dependencies.getSlots ||
    ((params) =>
      require("../../application/appointmentApplicationService").getSlots(params));
  const executeScheduleInterview =
    dependencies.executeScheduleInterview ||
    ((phoneArg, payload, opts) =>
      require("../../application/missionExecutionApplicationService").executeScheduleInterview(
        phoneArg,
        payload,
        opts
      ));

  // Idempotency: active appointment already present → do not create a second one.
  try {
    const existing = await findActive(phone, organizationId, agentId);
    if (existing?.id) {
      performed.push({
        type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
        appointmentId: existing.id,
        idempotent: true,
        inboundMessageId
      });
      return {
        attempted: true,
        performed,
        failed,
        skipped,
        success: true,
        idempotent: true,
        appointmentId: existing.id,
        reason: REASON_CODES.EXECUTION_IDEMPOTENT_REPLAY
      };
    }
  } catch {
    // Active lookup failure must not invent a booking; fail closed.
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      detail: "active_appointment_lookup_failed"
    });
    return {
      attempted: true,
      performed,
      failed,
      skipped,
      success: false,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED
    };
  }

  // Stale-slot guard — re-read canonical availability immediately before write.
  try {
    const slotResult = await getSlots({
      organizationId,
      agentId,
      date: dateKey,
      dateEnd: dateKey,
      purpose: "recruiting_interview",
      timePreference: "any",
      maxResults: 48
    });
    const available = slotResult?.slots || slotResult?.items || slotResult || [];
    if (!slotsInclude(available, dateKey, timeKey)) {
      failed.push({
        type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
        reason: REASON_CODES.EXECUTION_SLOT_STALE,
        dateKey,
        timeKey
      });
      return {
        attempted: true,
        performed,
        failed,
        skipped,
        success: false,
        reason: REASON_CODES.EXECUTION_SLOT_STALE
      };
    }
  } catch {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_SLOT_STALE,
      detail: "availability_recheck_failed"
    });
    return {
      attempted: true,
      performed,
      failed,
      skipped,
      success: false,
      reason: REASON_CODES.EXECUTION_SLOT_STALE
    };
  }

  let scheduleResult;
  try {
    scheduleResult = await executeScheduleInterview(
      phone,
      {
        dateKey,
        timeKey,
        interviewType: resolveInterviewType(context),
        timezone: context?.timezone || "America/New_York"
      },
      {
        organizationId,
        agentId,
        userId: agentId,
        inboundMessageId
      }
    );
  } catch (error) {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      detail: error?.message || "executeScheduleInterview_threw"
    });
    return {
      attempted: true,
      performed,
      failed,
      skipped,
      success: false,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED
    };
  }

  if (!scheduleResult?.success) {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      detail: scheduleResult?.error || scheduleResult?.message || "canonical_failed"
    });
    return {
      attempted: true,
      performed,
      failed,
      skipped,
      success: false,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      scheduleResult
    };
  }

  const appointmentId =
    scheduleResult.appointmentId ||
    scheduleResult.appointment?.id ||
    scheduleResult.id ||
    null;

  performed.push({
    type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
    appointmentId,
    idempotent: false,
    inboundMessageId,
    dateKey,
    timeKey
  });

  // Non-create proposals remain skipped (no v2 WhatsApp / cancel / withdraw path).
  for (const proposal of authorization.proposals || []) {
    if (proposal.type !== V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT) {
      skipped.push(proposal.type);
    }
  }

  return {
    attempted: true,
    performed,
    failed,
    skipped,
    success: true,
    idempotent: false,
    appointmentId,
    scheduleResult,
    reason: null
  };
}

module.exports = {
  executeAuthorizedSideEffects,
  resolveConfirmedSlot,
  resolveProspectPhone,
  resolveInterviewType,
  slotsInclude
};
