/**
 * Sprint 16.9 — Organization tenant guard.
 * Ensures requests operate within the authenticated user's organization boundary.
 * Support Mode: rebinds authContext.organizationId to the effective tenant so
 * filterProspectsForAuthContext / canAccessProspect see Support Mode org, not home org.
 * BR-160 — Super Admin without Support Mode is control-plane only (no home-org fallback).
 */

const { isSuperAdmin } = require("../security/saasRoles");
const {
  getEffectiveOrganizationId,
  isGlobalSuperAdminControlPlane
} = require("../core/effectiveOrganizationContext");

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

    const homeOrganizationId = context.homeOrganizationId || context.organizationId || null;
    const controlPlane = isGlobalSuperAdminControlPlane(context, req.supportContext);
    const effectiveOrganizationId = getEffectiveOrganizationId(req);
    const requestedOrgId = resolveRequestedOrganizationId(req);

    if (controlPlane) {
      if (requestedOrgId) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "Cross-organization access is not permitted."
        });
      }

      req.effectiveOrganizationId = null;
      req.controlPlaneOnly = true;
      req.authContext = {
        ...context,
        organizationId: null,
        homeOrganizationId
      };
      req.tenantContext = {
        organizationId: null,
        homeOrganizationId,
        userId: context.userId,
        role: context.role,
        saasRole: context.saasRole,
        permissions: context.permissions || [],
        isSuperAdmin: isSuperAdmin(context.saasRole),
        controlPlaneOnly: true,
        supportMode: null
      };
      return next();
    }

    if (!effectiveOrganizationId) {
      return res.status(403).json({
        error: "TENANT_CONTEXT_REQUIRED",
        message: "Effective organization is required."
      });
    }

    if (requestedOrgId && String(requestedOrgId) !== String(effectiveOrganizationId)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Cross-organization access is not permitted."
      });
    }

    req.effectiveOrganizationId = effectiveOrganizationId;
    req.controlPlaneOnly = false;
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
      controlPlaneOnly: false,
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
