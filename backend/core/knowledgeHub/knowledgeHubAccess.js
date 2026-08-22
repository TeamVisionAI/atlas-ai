/**
 * Knowledge Hub access — tenant feature + RBAC.
 * RVP/Admin (knowledge:write) bypass tenant gate; field users require knowledgeHubEnabled.
 */

const {
  TENANT_FEATURES,
  resolveTenantFeatureEffective
} = require("../tenantFeatureControls");
const { hasPermission } = require("../../security/authorizationService");
const { PERMISSIONS } = require("../../security/permissions");

const KNOWLEDGE_READ_PERMISSION = PERMISSIONS.KNOWLEDGE_READ;

const ACCESS_CODES = Object.freeze({
  NOT_ENABLED: "KNOWLEDGE_HUB_NOT_ENABLED",
  FORBIDDEN: "KNOWLEDGE_HUB_FORBIDDEN"
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

function hasManagementKnowledgeBypass(authContext) {
  return hasPermission(authContext, PERMISSIONS.KNOWLEDGE_WRITE);
}

function evaluateKnowledgeHubAccess({
  organizationId,
  authContext = null,
  permissions = null,
  userId = null,
  tenantFeatures = null,
  lifecycleStatus = null,
  env = process.env
} = {}) {
  const orgId = String(organizationId || "").trim();
  const context = buildAuthContextForAccess({
    authContext,
    permissions,
    userId,
    organizationId: orgId
  });

  if (!hasPermission(context, KNOWLEDGE_READ_PERMISSION)) {
    return {
      allowed: false,
      reason: "RBAC_DENIED",
      code: ACCESS_CODES.FORBIDDEN,
      feature: null,
      managementBypass: false
    };
  }

  if (!orgId) {
    return {
      allowed: false,
      reason: "ORGANIZATION_REQUIRED",
      code: ACCESS_CODES.NOT_ENABLED,
      feature: null,
      managementBypass: false
    };
  }

  if (hasManagementKnowledgeBypass(context)) {
    return {
      allowed: true,
      reason: null,
      code: null,
      feature: null,
      managementBypass: true
    };
  }

  const feature = resolveTenantFeatureEffective({
    organizationId: orgId,
    featureKey: TENANT_FEATURES.KNOWLEDGE_HUB,
    tenantFeatures,
    lifecycleStatus,
    env
  });

  if (feature.enabled !== true) {
    return {
      allowed: false,
      reason: feature.reason || "TENANT_GATE_OFF",
      code: ACCESS_CODES.NOT_ENABLED,
      feature,
      managementBypass: false
    };
  }

  return {
    allowed: true,
    reason: null,
    code: null,
    feature,
    managementBypass: false
  };
}

function assertKnowledgeHubAccess(options = {}) {
  const result = evaluateKnowledgeHubAccess(options);
  if (result.allowed) {
    return result;
  }

  const error = new Error(
    result.code === ACCESS_CODES.FORBIDDEN
      ? "Knowledge Hub requires knowledge:read permission"
      : "Knowledge Hub is not enabled for this organization"
  );
  error.statusCode = 403;
  error.code = result.code;
  error.reason = result.reason;
  error.feature = result.feature;
  throw error;
}

async function assertKnowledgeHubAccessAsync(options = {}) {
  const orgId = String(options.organizationId || "").trim();
  if (!orgId) {
    const error = new Error("organizationId is required for Knowledge Hub");
    error.statusCode = 403;
    error.code = ACCESS_CODES.NOT_ENABLED;
    error.reason = "ORGANIZATION_REQUIRED";
    throw error;
  }

  let tenantFeatures = options.tenantFeatures;
  let lifecycleStatus = options.lifecycleStatus;

  if (tenantFeatures == null && !hasManagementKnowledgeBypass(options.authContext)) {
    const { isTenantFeatureEnabledAsync } = require("../../services/tenantFeatureService");
    const loaded = await isTenantFeatureEnabledAsync(orgId, TENANT_FEATURES.KNOWLEDGE_HUB, {
      lifecycleStatus,
      env: options.env,
      backfillSeedFromEnv: options.backfillSeedFromEnv
    });
    if (loaded.enabled !== true) {
      const error = new Error("Knowledge Hub is not enabled for this organization");
      error.statusCode = 403;
      error.code = ACCESS_CODES.NOT_ENABLED;
      error.reason = loaded.reason;
      error.feature = loaded.effective || loaded;
      throw error;
    }
    tenantFeatures = {
      [TENANT_FEATURES.KNOWLEDGE_HUB]: true
    };
    lifecycleStatus =
      lifecycleStatus !== undefined
        ? lifecycleStatus
        : loaded.lifecycle?.status ?? loaded.effective?.lifecycle?.status ?? null;
  }

  return assertKnowledgeHubAccess({
    ...options,
    organizationId: orgId,
    tenantFeatures,
    lifecycleStatus
  });
}

async function resolveKnowledgeHubAccessAsync(options = {}) {
  try {
    const result = await assertKnowledgeHubAccessAsync(options);
    return { ...result, allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: error.reason || error.code || ACCESS_CODES.FORBIDDEN,
      code: error.code || ACCESS_CODES.FORBIDDEN,
      feature: error.feature || null,
      managementBypass: false
    };
  }
}

module.exports = {
  ACCESS_CODES,
  KNOWLEDGE_READ_PERMISSION,
  evaluateKnowledgeHubAccess,
  assertKnowledgeHubAccess,
  assertKnowledgeHubAccessAsync,
  resolveKnowledgeHubAccessAsync,
  hasManagementKnowledgeBypass
};
