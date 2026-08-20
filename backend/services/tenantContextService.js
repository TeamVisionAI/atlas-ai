/**
 * Sprint 16.9 — Tenant context helpers for organization-scoped queries.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");

function getTenantOrganizationId(req) {
  return getEffectiveOrganizationId(req) || DEFAULT_ORGANIZATION_ID;
}

function resolveTenantOrganizationId(req, requestedOrganizationId) {
  if (!req?.authContext) {
    return DEFAULT_ORGANIZATION_ID;
  }

  const effectiveOrganizationId = getEffectiveOrganizationId(req);
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
