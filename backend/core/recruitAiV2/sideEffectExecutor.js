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
const { isActiveAppointment } = require("../activeAppointmentResolver");
const { buildIsoTimestamp } = require("../../services/availabilityService");
const {
  appointmentMatchesProspectIdentity
} = require("../appointmentProspectIdentity");
const { buildSchedulingAttemptId } = require("../sharedScheduling/schedulingIdempotency");
const { resolveSchedulingConfig } = require("../sharedScheduling/sharedSchedulingConfig");
const {
  buildSchedulingDiagnostics,
  logSchedulingDiagnostics
} = require("../sharedScheduling/schedulingObservability");

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
 * Exact-slot match for idempotency / BR-122 reconcile.
 * Requires active lifecycle + same resolved start instant.
 * When scope fields are provided, also requires org / agent / canonical prospect alignment.
 * Does not guess across orgs — missing scoped identity fields fail closed.
 */
function appointmentMatchesRequestedSlot(
  appointment,
  dateKey,
  timeKey,
  timezone = "America/New_York",
  scope = {}
) {
  if (!appointment?.id || !dateKey || !timeKey) {
    return false;
  }
  if (!isActiveAppointment(appointment)) {
    return false;
  }

  const organizationId = scope.organizationId || null;
  const agentId = scope.agentId || null;
  const prospectId = scope.prospectId || null;

  if (organizationId) {
    const apptOrg = appointment.organizationId || appointment.organization_id || null;
    if (!apptOrg || apptOrg !== organizationId) {
      return false;
    }
  }

  if (agentId) {
    const apptAgent =
      appointment.agentId ||
      appointment.agent_id ||
      appointment.ownerRepId ||
      appointment.owner_rep_id ||
      null;
    if (!apptAgent || apptAgent !== agentId) {
      return false;
    }
  }

  if (prospectId) {
    if (!appointmentMatchesProspectIdentity(appointment, prospectId)) {
      return false;
    }
  }

  const start =
    appointment.startDateTime ||
    appointment.start_date_time ||
    appointment.scheduledTime ||
    null;
  if (!start) {
    return false;
  }

  let expectedIso;
  try {
    expectedIso = buildIsoTimestamp(dateKey, timeKey, timezone || "America/New_York");
  } catch {
    return false;
  }

  return new Date(start).getTime() === new Date(expectedIso).getTime();
}

/**
 * Prefer the appointment id from THIS schedule attempt when present on a failure payload.
 */
function resolveAttemptAppointmentId(scheduleResult) {
  return (
    scheduleResult?.appointmentId ||
    scheduleResult?.appointment?.id ||
    scheduleResult?.id ||
    null
  );
}

function telemetryBase({
  authorization,
  structuredDecision,
  context,
  options,
  phone = null
} = {}) {
  return {
    organizationId: authorization?.organizationId || context?.organizationId || null,
    agentId: authorization?.actingUserId || null,
    prospectId: context?.prospectId || options?.prospectId || null,
    phone: phone || null,
    decisionCode:
      structuredDecision?.decision?.nextAction ||
      V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
    correlationId: options?.inboundMessageId || options?.messageId || null
  };
}

function finishCreateResult(result, base, extras = {}) {
  try {
    const {
      EVENTS,
      emitRecruitAiV2Signal,
      resolveCalendarEventId
    } = require("./stage1Observability");
    const calendarEventId =
      extras.calendarEventId ||
      resolveCalendarEventId(result?.scheduleResult) ||
      resolveCalendarEventId(extras) ||
      null;
    const fields = {
      ...base,
      appointmentId: result?.appointmentId || extras.appointmentId || null,
      calendarEventId,
      reasonCodes: result?.reason
        ? [result.reason]
        : (result?.failed || []).map((f) => f.reason).filter(Boolean),
      detail: extras.detail || result?.failed?.[0]?.detail || null,
      idempotent: Boolean(result?.idempotent),
      reconciled: Boolean(result?.reconciledFromCanonicalFailure),
      outcome: result?.success ? "success" : "failure"
    };

    if (result?.success) {
      emitRecruitAiV2Signal(EVENTS.CREATE_SUCCEEDED, {
        ...fields,
        outcome: result.idempotent ? "idempotent_success" : "success"
      });
    } else if (result?.attempted) {
      if (result.reason === REASON_CODES.EXECUTION_ACTIVE_SLOT_CONFLICT) {
        emitRecruitAiV2Signal(EVENTS.DUPLICATE_APPOINTMENT, {
          ...fields,
          outcome: "conflict",
          detail: "active_appointment_exists_for_different_slot"
        });
      }
      emitRecruitAiV2Signal(EVENTS.CREATE_FAILED, fields);
    }
  } catch {
    // Telemetry must never affect booking.
  }
  return result;
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
    try {
      const {
        EVENTS,
        emitRecruitAiV2Signal
      } = require("./stage1Observability");
      emitRecruitAiV2Signal(EVENTS.EXECUTION_UNSUPPORTED_MUTATION, {
        ...telemetryBase({ authorization, structuredDecision, context, options }),
        action: (authorization.proposals || []).map((p) => p.type).join(",") || null,
        reasonCodes: [REASON_CODES.EXECUTION_UNSUPPORTED_ACTION],
        outcome: "denied"
      });
    } catch {
      // ignore
    }
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
  const schedulingConfig = resolveSchedulingConfig(context, options);
  const schedulingAttemptId = buildSchedulingAttemptId({
    organizationId,
    agentId,
    prospectId: context?.prospectId || options.prospectId || null,
    prospectPhone: phone,
    appointmentType: schedulingConfig.appointmentType,
    dateKey,
    timeKey,
    timezone: context?.timezone || "America/New_York",
    inboundMessageId
  });
  const base = telemetryBase({
    authorization,
    structuredDecision,
    context,
    options,
    phone
  });

  if (!organizationId || !agentId || !phone || !dateKey || !timeKey) {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_DENIED,
      detail: "missing_execution_scope_or_slot"
    });
    return finishCreateResult(
      {
        attempted: true,
        performed,
        failed,
        skipped,
        success: false,
        reason: REASON_CODES.EXECUTION_DENIED
      },
      base,
      { detail: "missing_execution_scope_or_slot" }
    );
  }

  try {
    const { EVENTS, emitRecruitAiV2Signal } = require("./stage1Observability");
    emitRecruitAiV2Signal(EVENTS.CREATE_ATTEMPTED, {
      ...base,
      outcome: "attempted",
      detail: `${dateKey}T${timeKey}`
    });
  } catch {
    // ignore
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

  // Idempotency: reuse only an active appointment for THIS exact slot.
  // Unrelated older actives must not be reported as a successful booking for a different time.
  try {
    const existing = await findActive(phone, organizationId, agentId);
    if (existing?.id) {
      const timezone = context?.timezone || "America/New_York";
      const matchScope = {
        organizationId,
        agentId,
        prospectId: context?.prospectId || options.prospectId || null
      };
      if (appointmentMatchesRequestedSlot(existing, dateKey, timeKey, timezone, matchScope)) {
        performed.push({
          type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
          appointmentId: existing.id,
          idempotent: true,
          inboundMessageId,
          dateKey,
          timeKey,
          timezone
        });
        return finishCreateResult(
          {
            attempted: true,
            performed,
            failed,
            skipped,
            success: true,
            idempotent: true,
            appointmentId: existing.id,
            reason: REASON_CODES.EXECUTION_IDEMPOTENT_REPLAY
          },
          base,
          {
            calendarEventId:
              existing.calendar_event_id || existing.calendarEventId || null
          }
        );
      }

      failed.push({
        type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
        reason: REASON_CODES.EXECUTION_ACTIVE_SLOT_CONFLICT,
        detail: "active_appointment_exists_for_different_slot",
        appointmentId: existing.id,
        dateKey,
        timeKey
      });
      return finishCreateResult(
        {
          attempted: true,
          performed,
          failed,
          skipped,
          success: false,
          reason: REASON_CODES.EXECUTION_ACTIVE_SLOT_CONFLICT,
          appointmentId: existing.id
        },
        base
      );
    }
  } catch {
    // Active lookup failure must not invent a booking; fail closed.
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      detail: "active_appointment_lookup_failed"
    });
    return finishCreateResult(
      {
        attempted: true,
        performed,
        failed,
        skipped,
        success: false,
        reason: REASON_CODES.EXECUTION_CANONICAL_FAILED
      },
      base,
      { detail: "active_appointment_lookup_failed" }
    );
  }

  // Stale-slot guard — re-read canonical availability immediately before write.
  try {
    const slotResult = await getSlots({
      organizationId,
      agentId,
      date: dateKey,
      dateEnd: dateKey,
      purpose: schedulingConfig.purpose,
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
      return finishCreateResult(
        {
          attempted: true,
          performed,
          failed,
          skipped,
          success: false,
          reason: REASON_CODES.EXECUTION_SLOT_STALE
        },
        base
      );
    }
  } catch {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_SLOT_STALE,
      detail: "availability_recheck_failed"
    });
    return finishCreateResult(
      {
        attempted: true,
        performed,
        failed,
        skipped,
        success: false,
        reason: REASON_CODES.EXECUTION_SLOT_STALE
      },
      base,
      { detail: "availability_recheck_failed" }
    );
  }

  let scheduleResult;
  try {
    logSchedulingDiagnostics("shared_scheduling_booking_attempt", {
      ...buildSchedulingDiagnostics({
        workflowConfig: schedulingConfig,
        booking: { idempotencyKey: schedulingAttemptId }
      }),
      organizationId,
      agentId,
      dateKey,
      timeKey
    });
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
        inboundMessageId,
        schedulingAttemptId,
        // Implements BR-127 — pass durable knownFacts for workflow qual sync.
        recruitAiV2Context: context || null,
        recruitAiV2CoreProspectId: context?.prospectId || options.prospectId || null
      }
    );
  } catch (error) {
    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      detail: error?.message || "executeScheduleInterview_threw"
    });
    return finishCreateResult(
      {
        attempted: true,
        performed,
        failed,
        skipped,
        success: false,
        reason: REASON_CODES.EXECUTION_CANONICAL_FAILED
      },
      base,
      { detail: error?.message || "executeScheduleInterview_threw" }
    );
  }

  if (!scheduleResult?.success) {
    // Implements BR-122 — safety net: reconcile only an authoritative orphan for THIS slot.
    try {
      const timezone = context?.timezone || "America/New_York";
      const attemptId = resolveAttemptAppointmentId(scheduleResult);
      let orphan = null;

      if (attemptId) {
        const findById =
          dependencies.findAppointmentById ||
          ((id, orgId) =>
            require("../activeAppointmentResolver").findAppointmentById(id, orgId));
        orphan = await findById(attemptId, organizationId);
      }

      if (!orphan?.id) {
        orphan = await findActive(phone, organizationId, agentId);
      }

      if (
        orphan?.id &&
        appointmentMatchesRequestedSlot(orphan, dateKey, timeKey, timezone, {
          organizationId,
          agentId,
          prospectId: context?.prospectId || options.prospectId || null
        })
      ) {
        performed.push({
          type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
          appointmentId: orphan.id,
          idempotent: false,
          inboundMessageId,
          dateKey,
          timeKey,
          timezone,
          reconciled: true,
          reconcileReason: "ACTIVE_APPOINTMENT_AFTER_CANONICAL_FAILURE"
        });
        return finishCreateResult(
          {
            attempted: true,
            performed,
            failed: [],
            skipped,
            success: true,
            appointmentId: orphan.id,
            reason: REASON_CODES.EXECUTION_RECONCILED_ACTIVE_APPOINTMENT,
            scheduleResult,
            reconciledFromCanonicalFailure: true
          },
          base,
          {
            calendarEventId:
              orphan.calendar_event_id || orphan.calendarEventId || null
          }
        );
      }
    } catch {
      // Fall through to failure path if orphan lookup fails.
    }

    failed.push({
      type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT,
      reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
      detail: scheduleResult?.error || scheduleResult?.message || "canonical_failed"
    });
    return finishCreateResult(
      {
        attempted: true,
        performed,
        failed,
        skipped,
        success: false,
        reason: REASON_CODES.EXECUTION_CANONICAL_FAILED,
        scheduleResult
      },
      base,
      {
        detail: scheduleResult?.error || scheduleResult?.message || "canonical_failed"
      }
    );
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

  return finishCreateResult(
    {
      attempted: true,
      performed,
      failed,
      skipped,
      success: true,
      idempotent: false,
      appointmentId,
      scheduleResult,
      reason: null
    },
    base
  );
}

module.exports = {
  executeAuthorizedSideEffects,
  resolveConfirmedSlot,
  resolveProspectPhone,
  resolveInterviewType,
  slotsInclude,
  appointmentMatchesRequestedSlot,
  resolveAttemptAppointmentId
};
