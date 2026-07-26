/**
 * Sprint 21 — Mission execution controller (HTTP adapter).
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { executeMission } = require("../application/missionExecutionApplicationService");

async function postMissionExecution(phone, body = {}, options = {}) {
  const result = await executeMission(phone, body, options);

  if (!result.success) {
    return result;
  }

  const missionControl = await getMissionControlWithActions(phone, options);

  return {
    ...result,
    missionControl
  };
}

module.exports = {
  postMissionExecution
};
