/**
 * RT2 — Tenant operational feature controls.
 *
 * Effective gate: GLOBAL_MASTER && TENANT_PERSISTED (&& user allowlist where applicable).
 * Env *_ENABLED flags remain emergency/master kill switches.
 * Env *_ORGANIZATION_IDS remain migration/compat mirrors for seed Team Vision only
 * when tenant features are unset — never grant non-seed tenants by env alone.
 */

const { isTeamVisionSeedTenant } = require("./teamVisionSeedTenant");
const { TENANT_STATUS } = require("./tenantLifecycle");

const TENANT_FEATURES = Object.freeze({
  RECRUIT_AI_AUTHORING: "recruitAiAuthoringEnabled",
  RECRUIT_AI_EXECUTION: "recruitAiExecutionEnabled",
  QR_CAMPAIGN_MANAGER: "qrCampaignManagerEnabled",
  CONVERSATIONS_CENTER: "conversationsCenterEnabled",
  KNOWLEDGE_HUB: "knowledgeHubEnabled"
});

const ALL_TENANT_FEATURE_KEYS = Object.freeze(Object.values(TENANT_FEATURES));

const DEFAULT_TENANT_FEATURES = Object.freeze({
  [TENANT_FEATURES.RECRUIT_AI_AUTHORING]: false,
  [TENANT_FEATURES.RECRUIT_AI_EXECUTION]: false,
  [TENANT_FEATURES.QR_CAMPAIGN_MANAGER]: false,
  [TENANT_FEATURES.CONVERSATIONS_CENTER]: false,
  [TENANT_FEATURES.KNOWLEDGE_HUB]: false
});

const TENANT_FEATURE_LABELS = Object.freeze({
  [TENANT_FEATURES.RECRUIT_AI_AUTHORING]: "Recruit AI Authoring",
  [TENANT_FEATURES.RECRUIT_AI_EXECUTION]: "Recruit AI Execution",
  [TENANT_FEATURES.QR_CAMPAIGN_MANAGER]: "QR Campaign Manager",
  [TENANT_FEATURES.CONVERSATIONS_CENTER]: "Conversations Center",
  [TENANT_FEATURES.KNOWLEDGE_HUB]: "Knowledge Hub"
});

function parseBooleanStrict(value) {
  if (value === true || value === false) {
    return { ok: true, value, present: true };
  }
  if (value == null || value === "") {
    return { ok: true, value: null, present: false };
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return { ok: true, value: true, present: true };
  }
  if (normalized === "false") {
    return { ok: true, value: false, present: true };
  }
  return { ok: false, value: null, present: true, malformed: true };
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

function normalizeTenantFeatures(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of ALL_TENANT_FEATURE_KEYS) {
    const parsed = parseBooleanStrict(source[key]);
    out[key] = parsed.present && parsed.ok ? parsed.value : null;
  }
  return out;
}

function materializedTenantFeatures(raw = null) {
  const normalized = normalizeTenantFeatures(raw);
  return {
    [TENANT_FEATURES.RECRUIT_AI_AUTHORING]:
      normalized[TENANT_FEATURES.RECRUIT_AI_AUTHORING] === true,
    [TENANT_FEATURES.RECRUIT_AI_EXECUTION]:
      normalized[TENANT_FEATURES.RECRUIT_AI_EXECUTION] === true,
    [TENANT_FEATURES.QR_CAMPAIGN_MANAGER]:
      normalized[TENANT_FEATURES.QR_CAMPAIGN_MANAGER] === true,
    [TENANT_FEATURES.CONVERSATIONS_CENTER]:
      normalized[TENANT_FEATURES.CONVERSATIONS_CENTER] === true,
    [TENANT_FEATURES.KNOWLEDGE_HUB]:
      normalized[TENANT_FEATURES.KNOWLEDGE_HUB] === true
  };
}

function assertKnownFeature(featureKey) {
  if (!ALL_TENANT_FEATURE_KEYS.includes(featureKey)) {
    const error = new Error(`Unknown tenant feature: ${featureKey}`);
    error.statusCode = 400;
    error.publicCode = "UNKNOWN_TENANT_FEATURE";
    throw error;
  }
  return featureKey;
}

function envOrgAllowlistForFeature(featureKey, env = process.env) {
  switch (featureKey) {
    case TENANT_FEATURES.RECRUIT_AI_AUTHORING:
      return parseIdList(env.RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS);
    case TENANT_FEATURES.RECRUIT_AI_EXECUTION:
      return parseIdList(env.RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS);
    case TENANT_FEATURES.QR_CAMPAIGN_MANAGER:
      return parseIdList(env.QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS);
    case TENANT_FEATURES.CONVERSATIONS_CENTER:
      return parseIdList(env.CONVERSATIONS_CENTER_ORGANIZATION_IDS);
    case TENANT_FEATURES.KNOWLEDGE_HUB:
      return parseIdList(env.KNOWLEDGE_HUB_ORGANIZATION_IDS);
    default:
      return [];
  }
}

function resolveGlobalMasterFlag(envValue) {
  const flag = parseBooleanStrict(envValue);
  if (flag.malformed) {
    return { enabled: false, reason: "MALFORMED_GLOBAL_GATE", present: true };
  }
  return {
    enabled: flag.value === true,
    reason: flag.value === true ? null : "GLOBAL_GATE_OFF",
    present: flag.present
  };
}

function isGlobalMasterEnabled(featureKey, env = process.env) {
  switch (featureKey) {
    case TENANT_FEATURES.RECRUIT_AI_AUTHORING:
      return resolveGlobalMasterFlag(env.RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED);
    case TENANT_FEATURES.RECRUIT_AI_EXECUTION:
      return resolveGlobalMasterFlag(env.RECRUIT_AI_V2_EXECUTION_ENABLED);
    case TENANT_FEATURES.QR_CAMPAIGN_MANAGER:
      return resolveGlobalMasterFlag(env.QR_CAMPAIGN_MANAGER_ENABLED);
    case TENANT_FEATURES.CONVERSATIONS_CENTER: {
      // Unset defaults ON so Team Vision production keeps working until an explicit kill switch.
      const raw = env.CONVERSATIONS_CENTER_ENABLED;
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        return { enabled: true, reason: null, present: false };
      }
      return resolveGlobalMasterFlag(raw);
    }
    case TENANT_FEATURES.KNOWLEDGE_HUB: {
      const raw = env.KNOWLEDGE_HUB_ENABLED;
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        return { enabled: true, reason: null, present: false };
      }
      return resolveGlobalMasterFlag(raw);
    }
    default:
      return { enabled: false, reason: "UNKNOWN_FEATURE", present: false };
  }
}

/**
 * Resolve persisted tenant org gate (no global / user / lifecycle).
 * Seed Team Vision with unset value may inherit env org allowlist (migration).
 * Non-seed missing value → OFF.
 */
function resolvePersistedTenantGate({
  organizationId,
  featureKey,
  tenantFeatures = null,
  env = process.env
} = {}) {
  assertKnownFeature(featureKey);
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    return {
      enabled: false,
      reason: "ORGANIZATION_REQUIRED",
      source: "missing_org",
      explicit: false
    };
  }

  const normalized = normalizeTenantFeatures(tenantFeatures);
  const explicit = normalized[featureKey];

  if (explicit === true) {
    return { enabled: true, reason: null, source: "persisted", explicit: true };
  }
  if (explicit === false) {
    return { enabled: false, reason: "TENANT_GATE_OFF", source: "persisted", explicit: true };
  }

  if (isTeamVisionSeedTenant(orgId)) {
    const allowlist = envOrgAllowlistForFeature(featureKey, env);
    if (allowlist.includes(orgId)) {
      return {
        enabled: true,
        reason: null,
        source: "seed_env_org_allowlist_compat",
        explicit: false
      };
    }
    // Preserve Team Vision Conversations Center production access when the new
    // flag is still unset (migration compat). Other features stay fail-closed.
    if (
      featureKey === TENANT_FEATURES.CONVERSATIONS_CENTER &&
      allowlist.length === 0
    ) {
      return {
        enabled: true,
        reason: null,
        source: "seed_conversations_compat_default_on",
        explicit: false
      };
    }
    if (featureKey === TENANT_FEATURES.KNOWLEDGE_HUB && allowlist.length === 0) {
      return {
        enabled: true,
        reason: null,
        source: "seed_knowledge_hub_compat_default_on",
        explicit: false
      };
    }
    return {
      enabled: false,
      reason: "TENANT_GATE_OFF",
      source: "seed_unset_not_allowlisted",
      explicit: false
    };
  }

  return {
    enabled: false,
    reason: "TENANT_GATE_OFF",
    source: "non_seed_default_off",
    explicit: false
  };
}

function resolveLifecycleGate(lifecycleStatus = null) {
  if (!lifecycleStatus) {
    return { enabled: true, reason: null };
  }
  const status = String(lifecycleStatus).trim().toUpperCase();
  if (status === TENANT_STATUS.SUSPENDED || status === "SUSPENDED") {
    return { enabled: false, reason: "TENANT_SUSPENDED" };
  }
  return { enabled: true, reason: null };
}

/**
 * Effective feature for an organization (global + tenant + optional lifecycle).
 * Does not evaluate user allowlists — callers keep those separate.
 */
function resolveTenantFeatureEffective({
  organizationId,
  featureKey,
  tenantFeatures = null,
  lifecycleStatus = null,
  env = process.env
} = {}) {
  assertKnownFeature(featureKey);

  const global = isGlobalMasterEnabled(featureKey, env);
  const tenant = resolvePersistedTenantGate({
    organizationId,
    featureKey,
    tenantFeatures,
    env
  });
  const lifecycle = resolveLifecycleGate(lifecycleStatus);

  const enabled =
    global.enabled === true && tenant.enabled === true && lifecycle.enabled === true;

  let reason = null;
  if (!global.enabled) {
    reason = global.reason || "GLOBAL_GATE_OFF";
  } else if (!tenant.enabled) {
    reason = tenant.reason || "TENANT_GATE_OFF";
  } else if (!lifecycle.enabled) {
    reason = lifecycle.reason || "TENANT_SUSPENDED";
  }

  return {
    featureKey,
    organizationId: organizationId || null,
    enabled,
    reason,
    global: {
      enabled: global.enabled,
      reason: global.reason
    },
    tenant: {
      enabled: tenant.enabled,
      reason: tenant.reason,
      source: tenant.source,
      explicit: tenant.explicit,
      configured: tenant.explicit ? (tenant.enabled ? "ON" : "OFF") : null
    },
    lifecycle: {
      enabled: lifecycle.enabled,
      reason: lifecycle.reason,
      status: lifecycleStatus || null
    }
  };
}

function formatFeatureStatusLabel(effective) {
  if (!effective) {
    return "OFF";
  }
  if (effective.enabled) {
    return "ON";
  }
  if (effective.tenant?.configured === "ON" && effective.global?.enabled === false) {
    return "Configured ON · Global gate OFF";
  }
  if (effective.lifecycle?.enabled === false) {
    return `Blocked — ${effective.lifecycle.reason || "tenant not operational"}`;
  }
  if (effective.tenant?.configured === "OFF" || effective.tenant?.enabled === false) {
    return "OFF";
  }
  return effective.reason || "OFF";
}

function presentTenantFeatureControls({
  organizationId,
  tenantFeatures = null,
  lifecycleStatus = null,
  readinessHints = {},
  env = process.env
} = {}) {
  const normalized = normalizeTenantFeatures(tenantFeatures);
  const material = materializedTenantFeatures(tenantFeatures);

  return ALL_TENANT_FEATURE_KEYS.map((featureKey) => {
    const effective = resolveTenantFeatureEffective({
      organizationId,
      featureKey,
      tenantFeatures: normalized,
      lifecycleStatus,
      env
    });
    const hint = readinessHints[featureKey] || null;
    let statusLabel = formatFeatureStatusLabel(effective);
    if (!effective.enabled && hint) {
      statusLabel = hint;
    }
    return {
      featureKey,
      label: TENANT_FEATURE_LABELS[featureKey] || featureKey,
      configured: material[featureKey],
      effective: effective.enabled,
      statusLabel,
      globalEnabled: effective.global.enabled,
      tenantSource: effective.tenant.source,
      reason: effective.reason,
      destructive: featureKey === TENANT_FEATURES.RECRUIT_AI_EXECUTION
    };
  });
}

function deriveSeedFeatureBackfillFromEnv(organizationId, env = process.env) {
  if (!isTeamVisionSeedTenant(organizationId)) {
    return { ...DEFAULT_TENANT_FEATURES };
  }
  return {
    [TENANT_FEATURES.RECRUIT_AI_AUTHORING]: envOrgAllowlistForFeature(
      TENANT_FEATURES.RECRUIT_AI_AUTHORING,
      env
    ).includes(String(organizationId)),
    [TENANT_FEATURES.RECRUIT_AI_EXECUTION]: envOrgAllowlistForFeature(
      TENANT_FEATURES.RECRUIT_AI_EXECUTION,
      env
    ).includes(String(organizationId)),
    [TENANT_FEATURES.QR_CAMPAIGN_MANAGER]: envOrgAllowlistForFeature(
      TENANT_FEATURES.QR_CAMPAIGN_MANAGER,
      env
    ).includes(String(organizationId)),
    // Preserve production Conversations + Knowledge Hub access for Team Vision seed.
    [TENANT_FEATURES.CONVERSATIONS_CENTER]: true,
    [TENANT_FEATURES.KNOWLEDGE_HUB]: true
  };
}

function isTenantFeatureEnabled(organizationId, featureKey, options = {}) {
  const effective = resolveTenantFeatureEffective({
    organizationId,
    featureKey,
    tenantFeatures: options.tenantFeatures ?? null,
    lifecycleStatus: options.lifecycleStatus ?? null,
    env: options.env || process.env
  });
  return {
    enabled: effective.enabled === true,
    reason: effective.reason,
    effective
  };
}

module.exports = {
  TENANT_FEATURES,
  ALL_TENANT_FEATURE_KEYS,
  DEFAULT_TENANT_FEATURES,
  normalizeTenantFeatures,
  materializedTenantFeatures,
  assertKnownFeature,
  envOrgAllowlistForFeature,
  isGlobalMasterEnabled,
  resolvePersistedTenantGate,
  resolveTenantFeatureEffective,
  formatFeatureStatusLabel,
  presentTenantFeatureControls,
  deriveSeedFeatureBackfillFromEnv,
  isTenantFeatureEnabled,
  parseIdList,
  TENANT_STATUS,
  TENANT_FEATURE_LABELS
};
