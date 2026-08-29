/**
 * Recruit AI v2 — live conversation authoring canary gate (BR-114).
 *
 * When enabled for an exact org + exact acting RVP, the authoritative WhatsApp
 * hub may let processRecruitAiV2Turn author the customer-facing reply.
 *
 * Independent from BR-111 mutation authorization and BR-112 live execution path.
 * Authoring ON + execution OFF is the intended first validation mode.
 *
 * Env:
 * - RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED=true|false
 * - RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS=comma-separated UUIDs
 * - RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS=comma-separated atlas_users.id UUIDs
 * - RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS (optional; default 8000)
 *
 * Fail-closed: absent / malformed / empty allowlists → ineligible.
 * Role is never consulted. Shadow/advisory never use this gate to author live.
 */

const { FEATURE_FLAGS } = require("./constants");
const {
  grantAuthorizesAuthoring
} = require("./v2CertificationGrants");

const DEFAULT_TIMEOUT_MS = 8000;

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  organizationIds: Object.freeze([]),
  userIds: Object.freeze([]),
  timeoutMs: DEFAULT_TIMEOUT_MS,
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
    timeoutMs: DEFAULT_TIMEOUT_MS,
    failClosed: true,
    failClosedReason: reason
  };
}

function resolveTimeoutMs(env = process.env) {
  const raw = env[FEATURE_FLAGS.LIVE_AUTHORING_TIMEOUT_MS_ENV];
  if (raw == null || raw === "") {
    return DEFAULT_TIMEOUT_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 60000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(n);
}

/**
 * Resolve live-authoring canary config. Defaults keep authoring fully off.
 */
function resolveLiveAuthoringConfig(env = process.env) {
  const flag = parseBooleanStrictTrue(
    env[FEATURE_FLAGS.LIVE_AUTHORING_ENABLED_ENV]
  );
  if (flag.malformed) {
    return failClosedConfig("MALFORMED_LIVE_AUTHORING_ENABLED");
  }

  return {
    enabled: Boolean(flag.value),
    organizationIds: parseIdList(
      env[FEATURE_FLAGS.LIVE_AUTHORING_ORGANIZATION_IDS_ENV]
    ),
    userIds: parseIdList(env[FEATURE_FLAGS.LIVE_AUTHORING_USER_IDS_ENV]),
    timeoutMs: resolveTimeoutMs(env),
    failClosed: false,
    failClosedReason: null
  };
}

function isLiveAuthoringFlagEnabled(env = process.env) {
  return resolveLiveAuthoringConfig(env).enabled === true;
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
 * Exact org + exact acting user only. Role is never considered.
 * Independent of RECRUIT_AI_V2_EXECUTION_ENABLED.
 */
function isEligibleForLiveAuthoring({
  organizationId,
  actingUserId,
  env = process.env,
  invocationSource = null,
  grant = null
} = {}) {
  // Shadow / advisory / playground must never take the live authoring path.
  if (invocationSource != null && invocationSource !== "live_whatsapp") {
    return {
      eligible: false,
      reason: "NON_LIVE_INVOCATION_SOURCE",
      config: resolveLiveAuthoringConfig(env)
    };
  }

  const config = resolveLiveAuthoringConfig(env);

  if (config.failClosed) {
    return {
      eligible: false,
      reason: config.failClosedReason || "FAIL_CLOSED",
      config
    };
  }

  if (!config.enabled) {
    return { eligible: false, reason: "LIVE_AUTHORING_DISABLED", config };
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

  // Implements BR-169 — durable certified-tenant + user authoring grant.
  if (grantAuthorizesAuthoring(grant)) {
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

function resolveActingUserIdFromProspect(prospect = {}) {
  return (
    prospect.owner_user_id ||
    prospect.ownerUserId ||
    prospect.assigned_agent_id ||
    prospect.assignedAgentId ||
    prospect.assigned_rvp_id ||
    prospect.assignedRvpId ||
    null
  );
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_TIMEOUT_MS,
  resolveLiveAuthoringConfig,
  isLiveAuthoringFlagEnabled,
  isOrganizationAllowlisted,
  isUserAllowlisted,
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect
};
