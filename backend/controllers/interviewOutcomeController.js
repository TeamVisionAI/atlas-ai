/**
 * Interview Outcome controller — returns refreshed Mission Control payload.
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { saveInterviewOutcome } = require("../core/interviewOutcomeEngine");

async function postInterviewOutcome(phone, body = {}) {
  const result = await saveInterviewOutcome(phone, body);

  if (!result.success) {
    return result;
  }

  const missionControl = await getMissionControlWithActions(phone);

  return {
    success: true,
    status: 200,
    outcome: result.outcome,
    workflowLabel: result.workflowLabel,
    followUpRecommendation: result.followUpRecommendation,
    missionControl
  };
}

module.exports = {
  postInterviewOutcome
};
