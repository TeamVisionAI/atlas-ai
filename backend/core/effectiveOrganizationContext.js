/**
 * Canonical effective tenant organization resolution.
 * Support Mode (super admin) overrides home org; normal users always use home org.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { isSuperAdmin } = require("../security/saasRoles");

function resolveEffectiveOrganizationId(authContext = null, supportContext = null) {
  const homeOrgId =
    authContext?.organizationId || authContext?.organization_id || DEFAULT_ORGANIZATION_ID;

  if (
    supportContext?.organizationId &&
    authContext &&
    isSuperAdmin(authContext.saasRole || authContext.role)
  ) {
    return supportContext.organizationId;
  }

  return homeOrgId;
}

function getEffectiveOrganizationId(req) {
  if (req?.effectiveOrganizationId) {
    return req.effectiveOrganizationId;
  }

  return resolveEffectiveOrganizationId(req?.authContext, req?.supportContext);
}

function isSupportModeActive(req) {
  return Boolean(
    req?.supportContext?.organizationId &&
      req?.authContext &&
      isSuperAdmin(req.authContext.saasRole || req.authContext.role)
  );
}

module.exports = {
  resolveEffectiveOrganizationId,
  getEffectiveOrganizationId,
  isSupportModeActive
};
