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
  listInterviewOutcomeIds
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

  const outcomeId = resolveOutcomeId(String(outcome || "").trim());
  const allowed = listInterviewOutcomeIds();

  if (!outcomeId || !allowed.includes(outcomeId)) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: "A valid interview outcome is required."
    };
  }

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

  if (appointment && isActiveAppointment(appointment)) {
    savedAppointment = await applyInterviewOutcomeToAppointment(appointment, outcomeId, {
      agentId,
      outcomeNotes: interactionNotes || fields.notes || null,
      channel: interactionType === "appointment_completion" ? "appointments" : "mission_control"
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

  await logConversation({
    phone,
    name: updatedProspect?.name || prospect.name,
    direction: "outgoing",
    message: `[Interview Completed] Outcome: ${config.label}`,
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
    outcome: config.label,
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
