/**
 * Canonical effective tenant organization resolution.
 * Support Mode (super admin) overrides home org; normal users always use home org.
 * BR-146 — never substitute the Team Vision seed tenant when org context is missing.
 * BR-160 — Super Admin without Support Mode is control-plane only (no home-org workload).
 */

const { isSuperAdmin } = require("../security/saasRoles");

function resolveSupportOrganizationId(supportContext = null) {
  return supportContext?.organizationId || supportContext?.organization_id || null;
}

function isGlobalSuperAdminControlPlane(authContext = null, supportContext = null) {
  if (!authContext) {
    return false;
  }

  return (
    isSuperAdmin(authContext.saasRole || authContext.role) &&
    !resolveSupportOrganizationId(supportContext)
  );
}

function resolveEffectiveOrganizationId(authContext = null, supportContext = null) {
  const homeOrgId = authContext?.organizationId || authContext?.organization_id || null;

  if (
    supportContext &&
    resolveSupportOrganizationId(supportContext) &&
    authContext &&
    isSuperAdmin(authContext.saasRole || authContext.role)
  ) {
    return resolveSupportOrganizationId(supportContext);
  }

  // Implements BR-160 — do not use home org / DEFAULT_ORGANIZATION_ID as operational tenant.
  if (isGlobalSuperAdminControlPlane(authContext, supportContext)) {
    return null;
  }

  return homeOrgId;
}

function getEffectiveOrganizationId(req) {
  if (req && Object.prototype.hasOwnProperty.call(req, "effectiveOrganizationId")) {
    return req.effectiveOrganizationId || null;
  }

  return resolveEffectiveOrganizationId(req?.authContext, req?.supportContext);
}

function isSupportModeActive(req) {
  return Boolean(
    resolveSupportOrganizationId(req?.supportContext) &&
      req?.authContext &&
      isSuperAdmin(req.authContext.saasRole || req.authContext.role)
  );
}

function isControlPlaneRequest(req) {
  return Boolean(
    req?.controlPlaneOnly === true ||
      isGlobalSuperAdminControlPlane(req?.authContext, req?.supportContext)
  );
}

/**
 * BR-160 — operational tenant org for org-scoped settings (Support Mode or tenant user).
 */
function resolveOperationalOrganizationId(req) {
  return req?.tenantContext?.organizationId || null;
}

/**
 * Personal integration rows are user-scoped but keyed by organization_id.
 * On the Super Admin control plane, read the signed-in user's home org only
 * for personal integrations — never for org settings or org channel state.
 */
function resolvePersonalIntegrationOrganizationId(req) {
  const operationalOrgId = resolveOperationalOrganizationId(req);
  if (operationalOrgId) {
    return operationalOrgId;
  }

  if (isControlPlaneRequest(req)) {
    return req?.tenantContext?.homeOrganizationId || null;
  }

  return null;
}

module.exports = {
  resolveEffectiveOrganizationId,
  getEffectiveOrganizationId,
  isSupportModeActive,
  isGlobalSuperAdminControlPlane,
  isControlPlaneRequest,
  resolveOperationalOrganizationId,
  resolvePersonalIntegrationOrganizationId,
  resolveSupportOrganizationId
};
