/**
 * Sprint 12.5.1 — Canonical interview outcome recording.
 * Unifies Mission Control, Workflow Gate, and appointment completion paths.
 */

const { findProspect } = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
const { isProductionProspect } = require("../core/productionProspectFilter");
const {
  getInterviewOutcomeConfig,
  resolveInterviewAdvancePayload,
  buildFollowUpRecommendation,
  resolveOutcomeId,
  listInterviewOutcomeSelectorIds,
  resolveSelectorOutcomeLabel
} = require("../core/interviewOutcomeMappings");
const { mapAppointmentSlugToOutcomeId } = require("../core/interviewOutcomeSlugMap");
const { applyInterviewOutcomeToAppointment } = require("../core/interviewOutcomeAppointmentSync");
const {
  findActiveAppointmentForProspect,
  findAppointmentById,
  isActiveAppointment
} = require("../core/activeAppointmentResolver");

async function recordInterviewOutcome({
  phone,
  outcome,
  fields = {},
  interactionNotes = null,
  followUpRecommendation = null,
  appointmentId = null,
  organizationId = null,
  agentId = null,
  interactionType = "phone"
}) {
  if (!isProductionProspect(phone)) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const rawOutcome = String(outcome || "").trim();
  const selectorIds = listInterviewOutcomeSelectorIds();

  if (!rawOutcome || !selectorIds.includes(rawOutcome)) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: "A valid interview outcome is required."
    };
  }

  const outcomeId = resolveOutcomeId(rawOutcome);

  const prospect = await findProspect(phone);

  if (!prospect) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  let advancePayload;

  try {
    advancePayload = resolveInterviewAdvancePayload(outcomeId, fields);
  } catch (error) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: error.message
    };
  }

  const resolvedFollowUpRecommendation =
    followUpRecommendation || buildFollowUpRecommendation(outcomeId, prospect);

  if (
    resolvedFollowUpRecommendation?.recommendedFollowUpDate &&
    !advancePayload.capturedFields.followUpDate
  ) {
    advancePayload.capturedFields.followUpDate =
      fields.followUpDate || resolvedFollowUpRecommendation.recommendedFollowUpDate;
    advancePayload.capturedFields.followUpTime = fields.followUpTime || "10:00";
  }

  if (interactionNotes) {
    advancePayload.capturedFields.interactionNotes = interactionNotes;
  }

  let appointment = null;

  if (appointmentId && organizationId) {
    appointment = await findAppointmentById(appointmentId, organizationId, agentId);
  } else if (organizationId) {
    // Org-scoped active appointment only — do not filter by agentId (BR-050 handoff may differ from actor).
    appointment = await findActiveAppointmentForProspect(phone, organizationId);
  }

  let savedAppointment = null;
  const isRescheduleOutcome = outcomeId === "Reschedule Interview";

  if (isRescheduleOutcome && organizationId) {
    const scheduledTime = advancePayload.capturedFields.interviewDateTime;

    if (!scheduledTime) {
      return {
        success: false,
        status: 400,
        error: "VALIDATION_ERROR",
        message: "Reschedule date and time are required."
      };
    }

    if (!agentId) {
      return {
        success: false,
        status: 400,
        error: "VALIDATION_ERROR",
        message: "An agent is required to reschedule an interview."
      };
    }

    const appointmentApplicationService = require("./appointmentApplicationService");
    const { deriveDateKeyTimeKey } = require("../core/legacyInterviewRepairEngine");

    try {
      if (appointment?.id) {
        // Implements BR-039 — reschedule mutates the canonical appointment row.
        savedAppointment = await appointmentApplicationService.rescheduleAppointment(
          appointment.id,
          {
            reason: fields.rescheduleReason || "prospect_requested",
            dateKey: fields.rescheduleDate || null,
            timeKey: fields.rescheduleTime || null,
            scheduledTime,
            skipSlotValidation: true,
            skipWorkflowAdvance: true,
            channel: interactionType === "appointment_completion" ? "appointments" : "mission_control"
          },
          { organizationId, agentId }
        );
      } else {
        // Implements BR-039 — never advance INTERVIEW_SCHEDULED without a persisted appointment.
        const keys =
          (fields.rescheduleDate && fields.rescheduleTime
            ? { dateKey: fields.rescheduleDate, timeKey: fields.rescheduleTime }
            : null) || deriveDateKeyTimeKey(scheduledTime);

        if (!keys?.dateKey || !keys?.timeKey) {
          return {
            success: false,
            status: 400,
            error: "VALIDATION_ERROR",
            message: "Reschedule date and time are required."
          };
        }

        const endDateTime = new Date(
          Date.parse(scheduledTime) + 30 * 60_000
        ).toISOString();
        const interviewType = String(
          fields.rescheduleInterviewType || prospect.interview_type || "Zoom"
        ).toLowerCase();
        const isVirtual = interviewType.includes("zoom") || interviewType.includes("virtual");

        savedAppointment = await appointmentApplicationService.createAppointment(
          {
            organizationId,
            agentId,
            prospectPhone: phone,
            purpose: "recruiting_interview",
            dateKey: keys.dateKey,
            timeKey: keys.timeKey,
            source: "mission_control",
            meetingType: isVirtual ? "virtual" : "in_person",
            meetingProvider: isVirtual ? "zoom" : undefined,
            existingBooking: {
              success: true,
              startTimeISO: scheduledTime,
              endTimeISO: endDateTime,
              // Do not trust a stale prospect calendar_event_id after reconnect.
              googleCalendarEventId: null,
              googleCalendarSynced: false
            },
            skipWorkflowSideEffects: true,
            skipReminders: false,
            skipProspectUpdate: false,
            metadata: {
              createdFromOutcomeReschedule: true
            }
          },
          { organizationId, agentId }
        );

        savedAppointment = await appointmentApplicationService.reconcileAppointmentGoogleCalendar(
          savedAppointment.id,
          { organizationId, agentId }
        );
      }
    } catch (error) {
      return {
        success: false,
        status: error.statusCode || 500,
        error: error.code || "RESCHEDULE_FAILED",
        message: error.message
      };
    }
  } else if (appointment && isActiveAppointment(appointment)) {
    savedAppointment = await applyInterviewOutcomeToAppointment(appointment, outcomeId, {
      agentId,
      outcomeNotes: interactionNotes || fields.notes || null,
      channel: interactionType === "appointment_completion" ? "appointments" : "mission_control",
      interviewDateTime: advancePayload.capturedFields.interviewDateTime || null,
      scheduledTime: advancePayload.capturedFields.interviewDateTime || null,
      reason: fields.rescheduleReason || "prospect_requested"
    });
  }

  if (!organizationId) {
    return {
      success: false,
      status: 400,
      error: "TENANT_ORGANIZATION_REQUIRED",
      message: "Organization context is required for interview outcome workflow advancement."
    };
  }

  const workflowResult = await advanceProspectWorkflow(phone, {
    targetMilestone: advancePayload.targetMilestone,
    capturedFields: advancePayload.capturedFields,
    interactionNotes: interactionNotes || advancePayload.interactionNotes,
    interactionType,
    organizationId
  });

  if (!workflowResult.success) {
    return workflowResult;
  }

  const updatedProspect = await findProspect(phone);
  const config = getInterviewOutcomeConfig(outcomeId);
  const outcomeLabel = resolveSelectorOutcomeLabel(rawOutcome, config).replace(
    /^[^\p{L}\p{N}]+/u,
    ""
  );

  await logConversation({
    phone,
    name: updatedProspect?.name || prospect.name,
    direction: "outgoing",
    message: `[Interview Completed] Outcome: ${outcomeLabel}`,
    intent: "INTERVIEW_OUTCOME",
    pipeline: "AGENT",
    currentStep: updatedProspect?.current_step || prospect.current_step,
    language:
      updatedProspect?.language ||
      updatedProspect?.communication_language ||
      prospect.language ||
      "en",
    city: updatedProspect?.city || prospect.city,
    state: updatedProspect?.state || prospect.state
  });

  return {
    success: true,
    status: 200,
    outcome: outcomeLabel,
    outcomeId,
    workflowLabel: config.workflowLabel,
    followUpRecommendation: resolvedFollowUpRecommendation,
    workflow: workflowResult.workflow,
    appointment: savedAppointment,
    events: workflowResult.eventsEmitted || []
  };
}

async function recordInterviewOutcomeFromAppointmentSlug({
  phone,
  appointmentId,
  outcomeSlug,
  outcomeNotes = null,
  organizationId,
  agentId
}) {
  const outcomeId = mapAppointmentSlugToOutcomeId(outcomeSlug);

  return recordInterviewOutcome({
    phone,
    outcome: outcomeId,
    fields: { notes: outcomeNotes },
    interactionNotes: outcomeNotes,
    appointmentId,
    organizationId,
    agentId,
    interactionType: "appointment_completion"
  });
}

module.exports = {
  recordInterviewOutcome,
  recordInterviewOutcomeFromAppointmentSlug
};
