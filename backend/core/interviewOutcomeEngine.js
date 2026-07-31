/**
 * Interview Outcome Engine — delegates to canonical application service.
 */

const {
  recordInterviewOutcome
} = require("../application/interviewOutcomeApplicationService");
const {
  buildInterviewOutcomeReadModel,
  buildFollowUpRecommendation
} = require("./interviewOutcomeMappings");

async function saveInterviewOutcome(phone, body = {}, context = {}) {
  return recordInterviewOutcome({
    phone,
    outcome: body.outcome,
    fields: body.fields || {},
    interactionNotes: body.interactionNotes || null,
    followUpRecommendation: body.followUpRecommendation || null,
    organizationId: context.organizationId || null,
    agentId: context.agentId || context.userId || null,
    interactionType: "phone"
  });
}

module.exports = {
  saveInterviewOutcome,
  buildInterviewOutcomeReadModel,
  buildFollowUpRecommendation
};
