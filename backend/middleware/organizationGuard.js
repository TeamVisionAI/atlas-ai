/**
 * Sprint 16.9 — Organization tenant guard.
 * Ensures requests operate within the authenticated user's organization boundary.
 */

const { isSuperAdmin } = require("../security/saasRoles");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");

function resolveRequestedOrganizationId(req) {
  return (
    req.params.organizationId ||
    req.query.organizationId ||
    req.query.organization_id ||
    req.body?.organizationId ||
    req.body?.organization_id ||
    null
  );
}

function organizationGuard(options = {}) {
  void options;

  return function organizationGuardMiddleware(req, res, next) {
    const context = req.authContext;

    if (!context) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }

    const effectiveOrganizationId =
      getEffectiveOrganizationId(req) || context.organizationId || DEFAULT_ORGANIZATION_ID;
    const requestedOrgId = resolveRequestedOrganizationId(req);

    if (requestedOrgId && String(requestedOrgId) !== String(effectiveOrganizationId)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Cross-organization access is not permitted."
      });
    }

    req.effectiveOrganizationId = effectiveOrganizationId;
    req.tenantContext = {
      organizationId: effectiveOrganizationId,
      homeOrganizationId: context.organizationId || DEFAULT_ORGANIZATION_ID,
      userId: context.userId,
      role: context.role,
      saasRole: context.saasRole,
      permissions: context.permissions || [],
      isSuperAdmin: isSuperAdmin(context.saasRole),
      supportMode: req.supportContext
        ? {
            organizationId: req.supportContext.organizationId,
            enteredAt: req.supportContext.enteredAt
          }
        : null
    };

    return next();
  };
}

module.exports = {
  organizationGuard,
  resolveRequestedOrganizationId
};
