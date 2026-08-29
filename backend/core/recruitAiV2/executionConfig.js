/**
 * Recruit AI v2 — fail-closed execution canary config (BR-111).
 *
 * Env:
 * - RECRUIT_AI_V2_EXECUTION_ENABLED=true|false (only exact "true" enables)
 * - RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS=comma-separated UUIDs
 * - RECRUIT_AI_V2_EXECUTION_USER_IDS=comma-separated atlas_users.id UUIDs
 *
 * Fail-closed:
 * - missing / malformed / empty allowlists → disabled eligibility
 * - org allowlist alone never authorizes (user allowlist required)
 * - role is never consulted
 */

const { FEATURE_FLAGS } = require("./constants");
const {
  grantAuthorizesExecution
} = require("./v2CertificationGrants");

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  organizationIds: Object.freeze([]),
  userIds: Object.freeze([]),
  failClosed: false,
  failClosedReason: null
});

function parseBooleanStrictTrue(value) {
  if (value == null || value === "") {
    return { ok: true, value: false, present: false };
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return { ok: true, value: true, present: true };
  }
  if (normalized === "false") {
    return { ok: true, value: false, present: true };
  }
  // "1" / "yes" / "on" / garbage → malformed → fail closed
  return { ok: false, value: false, present: true, malformed: true };
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value.map((id) => String(id).trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function failClosedConfig(reason) {
  return {
    enabled: false,
    organizationIds: [],
    userIds: [],
    failClosed: true,
    failClosedReason: reason
  };
}

/**
 * Resolve execution canary config. Defaults keep execution fully off.
 */
function resolveExecutionConfig(env = process.env) {
  const flagRaw = env[FEATURE_FLAGS.EXECUTION_ENABLED_ENV];
  const flag = parseBooleanStrictTrue(flagRaw);
  if (flag.malformed) {
    return failClosedConfig("MALFORMED_EXECUTION_ENABLED");
  }

  const organizationIds = parseIdList(
    env[FEATURE_FLAGS.EXECUTION_ORGANIZATION_IDS_ENV]
  );
  const userIds = parseIdList(env[FEATURE_FLAGS.EXECUTION_USER_IDS_ENV]);

  return {
    enabled: Boolean(flag.value),
    organizationIds,
    userIds,
    failClosed: false,
    failClosedReason: null
  };
}

function isExecutionFlagEnabled(env = process.env) {
  return resolveExecutionConfig(env).enabled === true;
}

function isOrganizationAllowlisted(organizationId, config) {
  if (!organizationId) {
    return false;
  }
  if (!Array.isArray(config.organizationIds) || config.organizationIds.length === 0) {
    return false;
  }
  return config.organizationIds.includes(String(organizationId));
}

function isUserAllowlisted(userId, config) {
  if (!userId) {
    return false;
  }
  if (!Array.isArray(config.userIds) || config.userIds.length === 0) {
    return false;
  }
  return config.userIds.includes(String(userId));
}

/**
 * Exact org + exact user gates only. Role is never considered.
 */
function isEligibleForExecution({
  organizationId,
  actingUserId,
  env = process.env,
  grant = null
} = {}) {
  const config = resolveExecutionConfig(env);

  if (config.failClosed) {
    return {
      eligible: false,
      reason: config.failClosedReason || "FAIL_CLOSED",
      config
    };
  }

  if (!config.enabled) {
    return { eligible: false, reason: "EXECUTION_DISABLED", config };
  }

  if (!organizationId || !actingUserId) {
    return { eligible: false, reason: "MISSING_SCOPE", config };
  }

  if (grant?.tenantSuspended === true) {
    return { eligible: false, reason: "TENANT_SUSPENDED", config };
  }

  const envOrg = isOrganizationAllowlisted(organizationId, config);
  const envUser = isUserAllowlisted(actingUserId, config);
  if (envOrg && envUser) {
    return { eligible: true, reason: null, config, source: "env_allowlist" };
  }

  // Implements BR-169 — execution is never implied by authoring or role.
  if (grantAuthorizesExecution(grant)) {
    return { eligible: true, reason: null, config, source: "durable_grant" };
  }

  if (!envOrg) {
    return {
      eligible: false,
      reason:
        Array.isArray(config.organizationIds) && config.organizationIds.length === 0
          ? "ORG_ALLOWLIST_EMPTY"
          : "ORG_NOT_ALLOWLISTED",
      config
    };
  }

  return {
    eligible: false,
    reason:
      Array.isArray(config.userIds) && config.userIds.length === 0
        ? "USER_ALLOWLIST_EMPTY"
        : "USER_NOT_ALLOWLISTED",
    config
  };
}

module.exports = {
  DEFAULT_CONFIG,
  resolveExecutionConfig,
  isExecutionFlagEnabled,
  isOrganizationAllowlisted,
  isUserAllowlisted,
  isEligibleForExecution
};
