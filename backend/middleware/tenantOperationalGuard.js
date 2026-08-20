/**
 * Block operational access for suspended home/effective tenants (normal users).
 * Lazy TRIAL expiry → PAST_DUE before operational check (BR-145).
 */

const { isSuperAdmin } = require("../security/saasRoles");
const { getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { shouldSkipAutomaticTrialExpiry } = require("../core/teamVisionSeedTenant");
const platformTenantService = require("../services/platformTenantService");
const tenantBillingService = require("../services/tenantBillingService");

function isExemptOperationalTenantCheck(req) {
  const path = String(req.originalUrl || req.url || req.path || "");

  if (
    path.startsWith("/api/platform") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/setup") ||
    path.startsWith("/health") ||
    path.startsWith("/webhook") ||
    path.startsWith("/api/platform-status")
  ) {
    return true;
  }

  return false;
}

function auditMetaFromRequest(req) {
  return {
    userId: req.authContext?.userId || null,
    userEmail: req.authContext?.email || null,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

async function tenantOperationalGuard(req, res, next) {
  try {
    if (!req.authContext || isExemptOperationalTenantCheck(req)) {
      return next();
    }

    if (isSuperAdmin(req.authContext.saasRole || req.authContext.role)) {
      return next();
    }

    const organizationId = getEffectiveOrganizationId(req);

    if (!shouldSkipAutomaticTrialExpiry(organizationId)) {
      await tenantBillingService.expireTrialIfNeeded(organizationId, auditMetaFromRequest(req));
    }

    const tenant = await platformTenantService.getTenant(organizationId);

    if (tenant && !platformTenantService.isTenantOperational(tenant.lifecycleStatus, {
      trialEndsAt: tenant.trialEndsAt
    })) {
      return res.status(403).json({
        error: "TENANT_SUSPENDED",
        message: "This organization is suspended."
      });
    }

    return next();
  } catch (error) {
    console.error("[tenantOperationalGuard]", error.message);
    return res.status(500).json({
      error: "TENANT_GUARD_FAILED",
      message: "Unable to validate tenant status."
    });
  }
}

module.exports = {
  tenantOperationalGuard,
  isExemptOperationalTenantCheck
};
