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
    appointment = await findActiveAppointmentForProspect(phone, organizationId, agentId);
  }

  let savedAppointment = null;
  const isRescheduleOutcome = outcomeId === "Reschedule Interview";

  if (isRescheduleOutcome && appointment?.id && organizationId) {
    const scheduledTime = advancePayload.capturedFields.interviewDateTime;

    if (!scheduledTime) {
      return {
        success: false,
        status: 400,
        error: "VALIDATION_ERROR",
        message: "Reschedule date and time are required."
      };
    }

    const appointmentApplicationService = require("./appointmentApplicationService");

    try {
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

  const workflowResult = await advanceProspectWorkflow(phone, {
    targetMilestone: advancePayload.targetMilestone,
    capturedFields: advancePayload.capturedFields,
    interactionNotes: interactionNotes || advancePayload.interactionNotes,
    interactionType
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
