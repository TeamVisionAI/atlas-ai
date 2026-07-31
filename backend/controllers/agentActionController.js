/**
 * Sprint 19.1 — Agent Action controller (HTTP adapter).
 * Business orchestration lives in agentActionApplicationService.js.
 */

const {
  executeAgentAction,
  syncAgentWorkflow,
  getMissionControlWithActions
} = require("../application/agentActionApplicationService");
const { getTenantOrganizationId } = require("../services/tenantContextService");

function tenantOptions(req) {
  const userId = req.tenantContext?.userId || req.authContext?.userId || req.atlasUser?.id || null;

  return {
    organizationId: getTenantOrganizationId(req),
    tenantScoped: true,
    userId,
    agentId: userId,
    authorUserId: userId
  };
}

async function getMissionControlWithActionsForRequest(req, phone) {
  return getMissionControlWithActions(phone, tenantOptions(req));
}

async function executeAgentActionForRequest(req, phone, action, payload = {}) {
  return executeAgentAction(phone, action, payload, tenantOptions(req));
}

async function syncAgentWorkflowForRequest(req, phone, workflowPayload = {}) {
  return syncAgentWorkflow(phone, workflowPayload);
}

module.exports = {
  executeAgentAction,
  syncAgentWorkflow,
  getMissionControlWithActions,
  getMissionControlWithActionsForRequest,
  executeAgentActionForRequest,
  syncAgentWorkflowForRequest
};
