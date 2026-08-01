/**
 * Sprint 21 — Mission execution controller (HTTP adapter).
 */

const { getMissionControlWithActions } = require("./agentActionController");
const { executeMission } = require("../application/missionExecutionApplicationService");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { logInterviewerTrace } = require("../dev/interviewerTrace");
const { resolveRecruiterDisplayName } = require("../core/whatsappCommunicationEngine");

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
  const missionType = body.missionType || body.type;
  const payload = body.payload || body;

  if (
    missionType === "ScheduleInterview" ||
    missionType === "schedule" ||
    payload?.dateKey
  ) {
    logInterviewerTrace({
      authenticatedUserId: options.userId || null,
      authenticatedUserName: resolveRecruiterDisplayName(options.actorUser),
      interviewerUserId: payload?.interviewerUserId || payload?.interviewer_user_id || null,
      interviewerName: null,
      appointmentId: null,
      source: "POST /api/mission-control/:phone/execute"
    });
  }

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
