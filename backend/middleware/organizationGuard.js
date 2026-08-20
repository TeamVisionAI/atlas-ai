/**
 * Sprint 16.9 — Organization tenant guard.
 * Ensures requests operate within the authenticated user's organization boundary.
 * Support Mode: rebinds authContext.organizationId to the effective tenant so
 * filterProspectsForAuthContext / canAccessProspect see Support Mode org, not home org.
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

    const homeOrganizationId = context.organizationId || DEFAULT_ORGANIZATION_ID;
    const effectiveOrganizationId =
      getEffectiveOrganizationId(req) || homeOrganizationId;
    const requestedOrgId = resolveRequestedOrganizationId(req);

    if (requestedOrgId && String(requestedOrgId) !== String(effectiveOrganizationId)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Cross-organization access is not permitted."
      });
    }

    req.effectiveOrganizationId = effectiveOrganizationId;
    // Prospect visibility (MC / Prospect Center) keys off authContext.organizationId.
    // Keep homeOrganizationId for audit / Support Mode exit; bind org to effective tenant.
    req.authContext = {
      ...context,
      organizationId: effectiveOrganizationId,
      homeOrganizationId
    };
    req.tenantContext = {
      organizationId: effectiveOrganizationId,
      homeOrganizationId,
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
