/**
 * Mission Control — required information save (prospect facts without outcome).
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { saveRequiredInformation } = require("../core/conversationOutcomeEngine");

async function postRequiredInformation(phone, body = {}, options = {}) {
  const result = await saveRequiredInformation(phone, body);

  if (!result.success) {
    return result;
  }

  const missionControl = await getMissionControlWithActions(phone, options);

  return {
    success: true,
    status: 200,
    changedFields: result.changedFields || [],
    missionControl
  };
}

module.exports = {
  postRequiredInformation
};
