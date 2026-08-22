/**
 * RT2 — Persist tenant operational features in organization_settings.settings.features.
 */

const { supabase } = require("./supabaseService");
const { writeAuditLog } = require("../security/auditLogService");
const { isTeamVisionSeedTenant } = require("../core/teamVisionSeedTenant");
const {
  TENANT_FEATURES,
  ALL_TENANT_FEATURE_KEYS,
  DEFAULT_TENANT_FEATURES,
  normalizeTenantFeatures,
  materializedTenantFeatures,
  presentTenantFeatureControls,
  deriveSeedFeatureBackfillFromEnv,
  assertKnownFeature,
  resolveTenantFeatureEffective
} = require("../core/tenantFeatureControls");
const { deriveLifecycleStatus } = require("../core/tenantLifecycle");

async function fetchSettingsRow(organizationId) {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.settings && typeof data.settings === "object" ? data.settings : {};
}

async function getOrganizationLifecycleStatus(organizationId) {
  const { data, error } = await supabase
    .from("organizations")
    .select("status, is_active, subscription_status")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return deriveLifecycleStatus(data);
}

async function getTenantFeatures(organizationId, options = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    const error = new Error("organizationId is required.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  const settings = await fetchSettingsRow(orgId);
  let features = normalizeTenantFeatures(settings.features);
  const allUnset = ALL_TENANT_FEATURE_KEYS.every((key) => features[key] == null);

  if (
    allUnset &&
    isTeamVisionSeedTenant(orgId) &&
    options.backfillSeedFromEnv !== false
  ) {
    const derived = deriveSeedFeatureBackfillFromEnv(orgId, options.env || process.env);
    const anyOn = Object.values(derived).some(Boolean);
    if (anyOn || options.forceSeedBackfill) {
      await updateTenantFeatures(
        orgId,
        derived,
        {
          userId: options.auditMeta?.userId || null,
          userEmail: options.auditMeta?.userEmail || "system",
          ipAddress: options.auditMeta?.ipAddress,
          userAgent: options.auditMeta?.userAgent,
          action: "platform.tenant_features_seed_backfill"
        }
      );
      features = normalizeTenantFeatures(derived);
    }
  } else if (
    isTeamVisionSeedTenant(orgId) &&
    features[TENANT_FEATURES.CONVERSATIONS_CENTER] == null &&
    options.backfillSeedFromEnv !== false
  ) {
    // New key on already-persisted TV features — preserve Conversations access.
    await updateTenantFeatures(
      orgId,
      { [TENANT_FEATURES.CONVERSATIONS_CENTER]: true },
      {
        userId: options.auditMeta?.userId || null,
        userEmail: options.auditMeta?.userEmail || "system",
        ipAddress: options.auditMeta?.ipAddress,
        userAgent: options.auditMeta?.userAgent,
        action: "platform.tenant_features_conversations_seed_backfill"
      }
    );
    features = {
      ...features,
      [TENANT_FEATURES.CONVERSATIONS_CENTER]: true
    };
  }

  return {
    organizationId: orgId,
    features,
    material: materializedTenantFeatures(features),
    source: settings.features ? "persisted" : "default_unset"
  };
}

async function updateTenantFeatures(organizationId, patch = {}, auditMeta = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    const error = new Error("organizationId is required.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  const incoming = patch && typeof patch === "object" ? patch : {};
  const allowedPatch = {};
  for (const key of ALL_TENANT_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      assertKnownFeature(key);
      if (typeof incoming[key] !== "boolean") {
        const error = new Error(`${key} must be a boolean.`);
        error.statusCode = 400;
        error.publicCode = "INVALID_TENANT_FEATURE_VALUE";
        throw error;
      }
      allowedPatch[key] = incoming[key];
    }
  }

  if (Object.keys(allowedPatch).length === 0) {
    const error = new Error("No valid feature flags provided.");
    error.statusCode = 400;
    error.publicCode = "EMPTY_FEATURE_PATCH";
    throw error;
  }

  const currentSettings = await fetchSettingsRow(orgId);
  const currentFeatures = normalizeTenantFeatures(currentSettings.features);
  const base = {
    ...DEFAULT_TENANT_FEATURES,
    ...Object.fromEntries(
      Object.entries(currentFeatures).filter(([, value]) => value != null)
    )
  };
  const nextFeatures = {
    ...materializedTenantFeatures(base),
    ...allowedPatch
  };

  const nextSettings = {
    ...currentSettings,
    features: {
      ...nextFeatures,
      updatedAt: new Date().toISOString()
    }
  };

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: orgId,
      settings: nextSettings,
      updated_at: new Date().toISOString()
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    throw error;
  }

  await writeAuditLog({
    organizationId: orgId,
    userId: auditMeta.userId || null,
    userEmail: auditMeta.userEmail || null,
    action: auditMeta.action || "platform.tenant_features_updated",
    targetType: "organization_settings",
    targetId: orgId,
    metadata: {
      patch: allowedPatch,
      features: nextFeatures
    },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  }).catch(() => {});

  return {
    organizationId: orgId,
    features: normalizeTenantFeatures(nextFeatures),
    material: materializedTenantFeatures(nextFeatures)
  };
}

async function initializeTenantFeaturesOff(organizationId, auditMeta = {}) {
  return updateTenantFeatures(
    organizationId,
    { ...DEFAULT_TENANT_FEATURES },
    {
      ...auditMeta,
      action: "platform.tenant_features_initialized_off"
    }
  );
}

async function getTenantFeatureControlsPresentation(organizationId, options = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    const error = new Error("organizationId is required.");
    error.statusCode = 400;
    error.publicCode = "ORGANIZATION_REQUIRED";
    throw error;
  }

  const loaded = await getTenantFeatures(orgId, options);
  const lifecycleStatus =
    options.lifecycleStatus ||
    (options.skipLifecycleFetch
      ? null
      : await getOrganizationLifecycleStatus(orgId).catch(() => null));

  const readinessHints = { ...(options.readinessHints || {}) };
  if (
    loaded.material[TENANT_FEATURES.QR_CAMPAIGN_MANAGER] &&
    options.whatsAppConnected === false
  ) {
    readinessHints[TENANT_FEATURES.QR_CAMPAIGN_MANAGER] =
      "Blocked — WhatsApp not connected";
  }

  const controls = presentTenantFeatureControls({
    organizationId: orgId,
    tenantFeatures: loaded.features,
    lifecycleStatus,
    readinessHints,
    env: options.env || process.env
  });

  return {
    organizationId: orgId,
    features: loaded.material,
    featuresRaw: loaded.features,
    lifecycleStatus,
    controls
  };
}

async function isTenantFeatureEnabledAsync(organizationId, featureKey, options = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    return {
      enabled: false,
      reason: "ORGANIZATION_REQUIRED",
      effective: null
    };
  }

  const loaded =
    options.tenantFeatures != null
      ? { features: normalizeTenantFeatures(options.tenantFeatures) }
      : await getTenantFeatures(orgId, {
          backfillSeedFromEnv: options.backfillSeedFromEnv,
          env: options.env
        });

  const lifecycleStatus =
    options.lifecycleStatus !== undefined
      ? options.lifecycleStatus
      : await getOrganizationLifecycleStatus(orgId).catch(() => null);

  const effective = resolveTenantFeatureEffective({
    organizationId: orgId,
    featureKey,
    tenantFeatures: loaded.features,
    lifecycleStatus,
    env: options.env || process.env
  });

  return {
    ...effective,
    enabled: effective.enabled === true
  };
}

module.exports = {
  TENANT_FEATURES,
  getTenantFeatures,
  updateTenantFeatures,
  initializeTenantFeaturesOff,
  getTenantFeatureControlsPresentation,
  isTenantFeatureEnabledAsync,
  getOrganizationLifecycleStatus
};
