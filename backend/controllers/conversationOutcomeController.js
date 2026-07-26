/**
 * W-006 — Mission Control conversation outcome controller.
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { saveConversationOutcome } = require("../core/conversationOutcomeEngine");

async function postConversationOutcome(phone, body = {}) {
  const result = await saveConversationOutcome(phone, body);

  if (!result.success) {
    return result;
  }

  const missionControl = await getMissionControlWithActions(phone);

  return {
    success: true,
    status: 200,
    outcome: result.outcome,
    missionControl
  };
}

module.exports = {
  postConversationOutcome
};
