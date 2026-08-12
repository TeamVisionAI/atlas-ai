/**
 * QR Campaign Manager rollout gate.
 *
 * Architecture is multi-tenant; public WhatsApp destination + interstitial branding
 * are not yet tenant-configurable. Creation is therefore org-allowlisted.
 *
 * Env:
 * - QR_CAMPAIGN_MANAGER_ENABLED=true|false
 * - QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS=comma-separated org UUIDs
 *
 * Fail-closed when disabled / empty allowlist / malformed flag.
 * Does not hardcode Team Vision in application logic — operators set the allowlist.
 */

const DEFAULT = Object.freeze({
  enabled: false,
  organizationIds: Object.freeze([]),
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

function resolveQrCampaignManagerConfig(env = process.env) {
  const flag = parseBooleanStrictTrue(env.QR_CAMPAIGN_MANAGER_ENABLED);
  if (flag.malformed) {
    return {
      enabled: false,
      organizationIds: [],
      failClosed: true,
      failClosedReason: "MALFORMED_QR_CAMPAIGN_MANAGER_ENABLED"
    };
  }

  return {
    enabled: Boolean(flag.value),
    organizationIds: parseIdList(env.QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS),
    failClosed: false,
    failClosedReason: null
  };
}

function isQrCampaignManagerEnabledForOrg(organizationId, env = process.env) {
  const config = resolveQrCampaignManagerConfig(env);
  if (!config.enabled || config.failClosed) {
    return {
      allowed: false,
      reason: config.failClosedReason || "QR_CAMPAIGN_MANAGER_DISABLED",
      config
    };
  }
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    return { allowed: false, reason: "ORGANIZATION_REQUIRED", config };
  }
  if (!config.organizationIds.length) {
    return { allowed: false, reason: "QR_CAMPAIGN_MANAGER_ORG_ALLOWLIST_EMPTY", config };
  }
  if (!config.organizationIds.includes(orgId)) {
    return { allowed: false, reason: "QR_CAMPAIGN_MANAGER_ORG_NOT_ALLOWLISTED", config };
  }
  return { allowed: true, reason: null, config };
}

module.exports = {
  DEFAULT,
  resolveQrCampaignManagerConfig,
  isQrCampaignManagerEnabledForOrg
};
