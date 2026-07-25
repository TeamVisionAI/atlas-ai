/**
 * Sprint 16.9 — Tenant context helpers for organization-scoped queries.
 */

const { resolveOrganizationId } = require("../security/authorizationService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

function getTenantOrganizationId(req) {
  return (
    req.tenantContext?.organizationId ||
    req.authContext?.organizationId ||
    DEFAULT_ORGANIZATION_ID
  );
}

function resolveTenantOrganizationId(req, requestedOrganizationId) {
  if (!req.authContext) {
    return DEFAULT_ORGANIZATION_ID;
  }

  return resolveOrganizationId(
    req.authContext,
    requestedOrganizationId ||
      req.query?.organizationId ||
      req.query?.organization_id ||
      req.params?.organizationId
  );
}

function withOrganizationFilter(query, organizationId) {
  return query.eq("organization_id", organizationId);
}

function assertSameOrganization(context, recordOrganizationId) {
  if (!recordOrganizationId) {
    return true;
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
