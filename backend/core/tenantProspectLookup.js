/**
 * Sprint 19.1 — Tenant prospect lookup contract helpers.
 */

class TenantOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required for tenant-scoped prospect lookup") {
    super(message);
    this.name = "TenantOrganizationRequiredError";
    this.code = "TENANT_ORGANIZATION_REQUIRED";
  }
}

function requireTenantOrganizationId(organizationId) {
  if (!organizationId) {
    throw new TenantOrganizationRequiredError();
  }

  return organizationId;
}

function isTenantScopedRequest(options = {}) {
  if (options.allowSystemIngress === true || options.tenantScoped === false) {
    return false;
  }

  if (options.tenantScoped === true || options.organizationId) {
    return true;
  }

  return false;
}

module.exports = {
  TenantOrganizationRequiredError,
  requireTenantOrganizationId,
  isTenantScopedRequest
};
