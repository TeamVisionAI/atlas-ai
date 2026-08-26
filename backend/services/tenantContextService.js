/**
 * Sprint 16.9 — Tenant context helpers for organization-scoped queries.
 * BR-146 — never fall back to the Team Vision seed tenant when effective org is missing.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");

function missingTenantContextError(statusCode = 403) {
  const error = new Error("Effective organization is required.");
  error.statusCode = statusCode;
  error.publicCode = statusCode === 401 ? "UNAUTHORIZED" : "TENANT_CONTEXT_REQUIRED";
  return error;
}

function getTenantOrganizationId(req) {
  const organizationId =
    req?.tenantContext?.organizationId || getEffectiveOrganizationId(req) || null;

  if (!organizationId) {
    throw missingTenantContextError();
  }

  return organizationId;
}

function resolveTenantOrganizationId(req, requestedOrganizationId) {
  if (!req?.authContext) {
    throw missingTenantContextError(401);
  }

  const effectiveOrganizationId = getTenantOrganizationId(req);
  const requested =
    requestedOrganizationId ||
    req.query?.organizationId ||
    req.query?.organization_id ||
    req.params?.organizationId ||
    req.body?.organizationId ||
    req.body?.organization_id ||
    null;

  if (requested && String(requested) !== String(effectiveOrganizationId)) {
    const error = new Error("Cross-organization access is not permitted.");
    error.statusCode = 403;
    error.publicCode = "FORBIDDEN";
    throw error;
  }

  return effectiveOrganizationId;
}

function withOrganizationFilter(query, organizationId) {
  return query.eq("organization_id", organizationId);
}

function assertSameOrganization(context, recordOrganizationId) {
  if (!context?.organizationId || !recordOrganizationId) {
    return false;
  }

  return String(context.organizationId) === String(recordOrganizationId);
}

function scopeQueryToTenant(baseQuery, req) {
  const organizationId = resolveTenantOrganizationId(req);
  return withOrganizationFilter(baseQuery, organizationId);
}

module.exports = {
  getTenantOrganizationId,
  resolveTenantOrganizationId,
  withOrganizationFilter,
  assertSameOrganization,
  scopeQueryToTenant,
  DEFAULT_ORGANIZATION_ID
};
