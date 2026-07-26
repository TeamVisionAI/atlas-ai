/**
 * Interview Outcome Engine — saves outcomes via existing workflow advancement.
 */

const { findProspect } = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const { advanceProspectWorkflow } = require("./humanAdvancementEngine");
const { isProductionProspect } = require("./productionProspectFilter");
const {
  getInterviewOutcomeConfig,
  resolveInterviewAdvancePayload,
  buildInterviewOutcomeReadModel,
  buildFollowUpRecommendation,
  resolveOutcomeId,
  listInterviewOutcomeIds
} = require("./interviewOutcomeMappings");

async function saveInterviewOutcome(phone, body = {}) {
  if (!isProductionProspect(phone)) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const outcome = resolveOutcomeId(String(body.outcome || "").trim());
  const allowed = listInterviewOutcomeIds();

  if (!outcome || !allowed.includes(outcome)) {
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
    advancePayload = resolveInterviewAdvancePayload(outcome, body.fields || {});
  } catch (error) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: error.message
    };
  }

  const followUpRecommendation =
    body.followUpRecommendation || buildFollowUpRecommendation(outcome, prospect);

  if (followUpRecommendation?.recommendedFollowUpDate && !advancePayload.capturedFields.followUpDate) {
    advancePayload.capturedFields.followUpDate =
      body.fields?.followUpDate || followUpRecommendation.recommendedFollowUpDate;
    advancePayload.capturedFields.followUpTime =
      body.fields?.followUpTime || "10:00";
  }

  const result = await advanceProspectWorkflow(phone, {
    targetMilestone: advancePayload.targetMilestone,
    capturedFields: advancePayload.capturedFields,
    interactionNotes: body.interactionNotes || advancePayload.interactionNotes,
    interactionType: "phone"
  });

  if (!result.success) {
    return result;
  }

  const updatedProspect = await findProspect(phone);
  const config = getInterviewOutcomeConfig(outcome);

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
    workflowLabel: config.workflowLabel,
    followUpRecommendation,
    workflow: result.workflow,
    events: result.eventsEmitted || []
  };
}

module.exports = {
  saveInterviewOutcome,
  buildInterviewOutcomeReadModel,
  buildFollowUpRecommendation
};
