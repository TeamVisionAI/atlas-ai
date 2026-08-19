/**
 * W-006 — Mission Control conversation outcome controller.
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { saveConversationOutcome } = require("../core/conversationOutcomeEngine");

async function postConversationOutcome(phone, body = {}, options = {}) {
  const organizationId = options.organizationId || null;
  const result = await saveConversationOutcome(phone, body, { organizationId });

  if (!result.success) {
    return result;
  }

  const missionControl = await getMissionControlWithActions(phone, options);

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
