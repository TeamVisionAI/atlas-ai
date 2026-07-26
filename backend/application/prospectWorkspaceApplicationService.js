/**
 * Sprint 19.1 — Prospect Workspace application orchestration.
 * Routes → Application Service → Read Model (no core → application inversion).
 */

const { getMissionControlWithActions } = require("./agentActionApplicationService");
const {
  composeProspectWorkspaceFromMissionControl
} = require("../core/prospectWorkspaceReadModel");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { requireTenantOrganizationId } = require("../core/tenantProspectLookup");
const { isProductionProspect } = require("../core/productionProspectFilter");

async function buildProspectWorkspaceReadModel(phone, options = {}) {
  const organizationId = requireTenantOrganizationId(options.organizationId);

  if (!phone) {
    return null;
  }

  if (!isProductionProspect(phone) && phone !== "latest") {
    return null;
  }

  const missionControl = await getMissionControlWithActions(phone, {
    organizationId,
    tenantScoped: true
  });

  if (!missionControl) {
    return null;
  }

  return composeProspectWorkspaceFromMissionControl(phone, missionControl, organizationId);
}

async function buildProspectWorkspaceForRequest(req, phone) {
  return buildProspectWorkspaceReadModel(phone, {
    organizationId: getTenantOrganizationId(req)
  });
}

module.exports = {
  buildProspectWorkspaceReadModel,
  buildProspectWorkspaceForRequest
};
