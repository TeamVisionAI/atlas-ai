/**
 * Sprint 21 — Mission execution controller (HTTP adapter).
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { executeMission } = require("../application/missionExecutionApplicationService");
const { getTenantOrganizationId } = require("../services/tenantContextService");

function buildMissionExecutionOptions(req) {
  const userId = req.tenantContext?.userId || req.authContext?.userId || req.atlasUser?.id || null;

  return {
    organizationId: getTenantOrganizationId(req),
    tenantScoped: true,
    userId,
    agentId: userId,
    authorUserId: userId,
    actorUser: req.atlasUser || null
  };
}

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
  postMissionExecution,
  buildMissionExecutionOptions
};
