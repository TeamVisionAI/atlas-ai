/**
 * Conversations Center access — GLOBAL_MASTER && TENANT_FEATURE && RBAC.
 * Effective org from organizationGuard / tenant context. Niovel user ID is not a product gate.
 */

const {
  TENANT_FEATURES,
  resolveTenantFeatureEffective
} = require("../tenantFeatureControls");
const { hasPermission } = require("../../security/authorizationService");
const { PERMISSIONS } = require("../../security/permissions");

/** Minimum permission to view list, history, reply, and inbox lifecycle actions. */
const CONVERSATIONS_CENTER_PERMISSION = PERMISSIONS.PROSPECT_COMMUNICATE;

const ACCESS_CODES = Object.freeze({
  NOT_ENABLED: "CONVERSATIONS_CENTER_NOT_ENABLED",
  FORBIDDEN: "CONVERSATIONS_CENTER_FORBIDDEN",
  /** @deprecated Prefer NOT_ENABLED — kept for older clients. */
  ORG_FORBIDDEN: "CONVERSATIONS_CENTER_ORG_FORBIDDEN",
  /** @deprecated Prefer FORBIDDEN — kept for older clients. */
  USER_FORBIDDEN: "CONVERSATIONS_CENTER_USER_FORBIDDEN"
});

function buildAuthContextForAccess({ authContext, permissions, userId, organizationId }) {
  if (authContext && typeof authContext === "object") {
    return authContext;
  }
  return {
    userId: userId || null,
    organizationId: organizationId || null,
    permissions: Array.isArray(permissions) ? permissions : [],
    status: "active",
    role: null
  };
}

/**
 * Sync evaluation when tenantFeatures (and optionally lifecycle) are already known.
 */
function evaluateConversationsCenterAccess({
  organizationId,
  authContext = null,
  permissions = null,
  userId = null,
  tenantFeatures = null,
  lifecycleStatus = null,
  env = process.env
} = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    return {
      allowed: false,
      reason: "ORGANIZATION_REQUIRED",
      code: ACCESS_CODES.NOT_ENABLED,
      feature: null
    };
  }

  const feature = resolveTenantFeatureEffective({
    organizationId: orgId,
    featureKey: TENANT_FEATURES.CONVERSATIONS_CENTER,
    tenantFeatures,
    lifecycleStatus,
    env
  });

  if (feature.enabled !== true) {
    return {
      allowed: false,
      reason: feature.reason || "TENANT_GATE_OFF",
      code: ACCESS_CODES.NOT_ENABLED,
      feature
    };
  }

  const context = buildAuthContextForAccess({
    authContext,
    permissions,
    userId,
    organizationId: orgId
  });

  if (!hasPermission(context, CONVERSATIONS_CENTER_PERMISSION)) {
    return {
      allowed: false,
      reason: "RBAC_DENIED",
      code: ACCESS_CODES.FORBIDDEN,
      feature
    };
  }

  return {
    allowed: true,
    reason: null,
    code: null,
    feature
  };
}

function assertConversationsCenterAccess(options = {}) {
  const result = evaluateConversationsCenterAccess(options);
  if (result.allowed) {
    return result;
  }

  const error = new Error(
    result.code === ACCESS_CODES.FORBIDDEN
      ? "Conversations Center requires prospect:communicate permission"
      : "Conversations Center is not enabled for this organization"
  );
  error.statusCode = 403;
  error.code = result.code;
  error.reason = result.reason;
  error.feature = result.feature;
  throw error;
}

/**
 * Async gate for routes — loads persisted tenant features when not injected.
 */
async function assertConversationsCenterAccessAsync(options = {}) {
  const orgId = String(options.organizationId || "").trim();
  if (!orgId) {
    const error = new Error("organizationId is required for Conversations Center");
    error.statusCode = 403;
    error.code = ACCESS_CODES.NOT_ENABLED;
    error.reason = "ORGANIZATION_REQUIRED";
    throw error;
  }

  let tenantFeatures = options.tenantFeatures;
  let lifecycleStatus = options.lifecycleStatus;

  if (tenantFeatures == null) {
    const {
      isTenantFeatureEnabledAsync
    } = require("../../services/tenantFeatureService");
    const loaded = await isTenantFeatureEnabledAsync(
      orgId,
      TENANT_FEATURES.CONVERSATIONS_CENTER,
      {
        lifecycleStatus,
        env: options.env,
        backfillSeedFromEnv: options.backfillSeedFromEnv
      }
    );
    if (loaded.enabled !== true) {
      const error = new Error(
        "Conversations Center is not enabled for this organization"
      );
      error.statusCode = 403;
      error.code = ACCESS_CODES.NOT_ENABLED;
      error.reason = loaded.reason;
      error.feature = loaded.effective || loaded;
      throw error;
    }
    tenantFeatures = {
      [TENANT_FEATURES.CONVERSATIONS_CENTER]: true
    };
    lifecycleStatus =
      lifecycleStatus !== undefined
        ? lifecycleStatus
        : loaded.lifecycle?.status ?? loaded.effective?.lifecycle?.status ?? null;
  }

  return assertConversationsCenterAccess({
    ...options,
    organizationId: orgId,
    tenantFeatures,
    lifecycleStatus
  });
}

async function resolveConversationsCenterAccessAsync(options = {}) {
  try {
    const result = await assertConversationsCenterAccessAsync(options);
    return { ...result, allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: error.reason || error.code || "CONVERSATIONS_CENTER_FORBIDDEN",
      code: error.code || ACCESS_CODES.FORBIDDEN,
      feature: error.feature || null
    };
  }
}

/**
 * Prospect visible in Conversations for the effective tenant (org-scoped).
 * Replaces the legacy Niovel owner/unassigned pilot filter.
 */
function isProspectInConversationsTenantScope(prospect, organizationId) {
  if (!prospect || !organizationId) {
    return false;
  }
  return String(prospect.organization_id || "") === String(organizationId);
}

/**
 * Conversations visibility = tenant org ∩ prospect hierarchy/user scope.
 * Fail closed when authContext cannot authorize the prospect.
 */
function isProspectInConversationsUserScope(prospect, organizationId, authContext = null) {
  if (!isProspectInConversationsTenantScope(prospect, organizationId)) {
    return false;
  }

  if (!authContext) {
    return false;
  }

  const { canAccessProspect } = require("../../security/authorizationService");
  return canAccessProspect(authContext, prospect);
}

/** @deprecated Use isProspectInConversationsTenantScope with effective organizationId. */
function isProspectInNiovelPilotScope(prospect) {
  // Legacy helper retained for older tests — no longer Niovel-owner scoped.
  const { TEAM_VISION_ORG_ID } = require("./constants");
  return isProspectInConversationsTenantScope(prospect, TEAM_VISION_ORG_ID);
}

/**
 * @deprecated Use assertConversationsCenterAccess / assertConversationsCenterAccessAsync.
 * Temporary sync shim for older tests — requires injected tenantFeatures for non-seed orgs.
 */
function assertConversationsCenterPilotAccess({
  userId,
  organizationId,
  authContext = null,
  permissions = null,
  tenantFeatures = null,
  lifecycleStatus = null,
  env = process.env
} = {}) {
  return assertConversationsCenterAccess({
    userId,
    organizationId,
    authContext,
    permissions,
    tenantFeatures,
    lifecycleStatus,
    env
  });
}

function isConversationsCenterPilotUser(options = {}) {
  try {
    assertConversationsCenterPilotAccess(options);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  CONVERSATIONS_CENTER_PERMISSION,
  ACCESS_CODES,
  evaluateConversationsCenterAccess,
  assertConversationsCenterAccess,
  assertConversationsCenterAccessAsync,
  resolveConversationsCenterAccessAsync,
  isProspectInConversationsTenantScope,
  isProspectInConversationsUserScope,
  isProspectInNiovelPilotScope,
  assertConversationsCenterPilotAccess,
  isConversationsCenterPilotUser
};
