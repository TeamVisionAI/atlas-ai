/**
 * BR-148 — Primerica agent lead/source capabilities.
 * Explicit per-user flags inside a tenant. Never derived from business_rank.
 *
 * Round Robin and Meta Ad Builder are NOT implemented here — flags only.
 */

const CAPABILITY_KEYS = Object.freeze([
  "canReceiveOrganizationLeads",
  "roundRobinEligible",
  "personalWhatsAppEnabled",
  "personalLeadSourcesEnabled",
  "personalMetaAdsEnabled"
]);

/** Safe defaults for new agents / missing rows. */
const DEFAULT_AGENT_CAPABILITIES = Object.freeze({
  canReceiveOrganizationLeads: true,
  roundRobinEligible: false,
  personalWhatsAppEnabled: false,
  personalLeadSourcesEnabled: false,
  // Future only — no ad builder in this release.
  personalMetaAdsEnabled: false
});

function asBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === "false" || value === 0 || value === "0") {
    return false;
  }
  return fallback;
}

/**
 * Normalize stored/partial capabilities to a complete, safe object.
 */
function normalizeAgentCapabilities(raw = null) {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  return {
    canReceiveOrganizationLeads: asBoolean(
      source.canReceiveOrganizationLeads,
      DEFAULT_AGENT_CAPABILITIES.canReceiveOrganizationLeads
    ),
    roundRobinEligible: asBoolean(
      source.roundRobinEligible,
      DEFAULT_AGENT_CAPABILITIES.roundRobinEligible
    ),
    personalWhatsAppEnabled: asBoolean(
      source.personalWhatsAppEnabled,
      DEFAULT_AGENT_CAPABILITIES.personalWhatsAppEnabled
    ),
    personalLeadSourcesEnabled: asBoolean(
      source.personalLeadSourcesEnabled,
      DEFAULT_AGENT_CAPABILITIES.personalLeadSourcesEnabled
    ),
    personalMetaAdsEnabled: asBoolean(
      source.personalMetaAdsEnabled,
      DEFAULT_AGENT_CAPABILITIES.personalMetaAdsEnabled
    )
  };
}

function resolveAgentCapabilitiesFromUser(user) {
  if (!user) {
    return normalizeAgentCapabilities(null);
  }

  return normalizeAgentCapabilities(
    user.agent_capabilities || user.agentCapabilities || null
  );
}

/**
 * Merge a partial admin patch onto existing capabilities.
 * Unknown keys ignored. personalMetaAdsEnabled may be set but remains non-functional.
 */
function mergeAgentCapabilitiesPatch(existing, patch = {}) {
  const base = normalizeAgentCapabilities(existing);
  const next = { ...base };

  for (const key of CAPABILITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
      next[key] = asBoolean(patch[key], base[key]);
    }
  }

  return next;
}

/**
 * Workspace readiness for personal operating setup.
 * Personal WhatsApp is NOT required when the capability is off.
 */
function evaluateAgentWorkspaceReadiness({
  capabilities = null,
  profileComplete = false,
  googleConnected = false,
  zoomConfigured = false,
  availabilityConfigured = false,
  personalWhatsAppConnected = false
} = {}) {
  const caps = normalizeAgentCapabilities(capabilities);
  const checks = {
    profile: Boolean(profileComplete),
    google: Boolean(googleConnected),
    zoom: Boolean(zoomConfigured),
    availability: Boolean(availabilityConfigured),
    leadChannel: caps.personalWhatsAppEnabled
      ? Boolean(personalWhatsAppConnected)
      : caps.canReceiveOrganizationLeads
        ? true
        : Boolean(personalWhatsAppConnected)
  };

  const leadChannelLabel = caps.personalWhatsAppEnabled
    ? personalWhatsAppConnected
      ? "Personal WhatsApp"
      : "Personal WhatsApp required"
    : caps.canReceiveOrganizationLeads
      ? "Organization Managed"
      : "No lead channel configured";

  const required = ["profile", "google", "zoom", "availability", "leadChannel"];
  const ready = required.every((key) => checks[key] === true);

  return {
    ready,
    checks,
    leadChannelLabel,
    personalWhatsAppRequired: caps.personalWhatsAppEnabled === true,
    capabilities: caps
  };
}

/**
 * Lead ownership routing rules (documentation + helpers; Round Robin not built).
 *
 * Shared organization source → tenant → assignment engine / future Round Robin → assigned user
 * Personal agent source → tenant + owning user → direct ownership (skip Round Robin unless reassigned)
 */
function resolveLeadOwnershipMode({
  sourceOwnership = null,
  campaignOwnerUserId = null,
  whatsappOwnerUserId = null
} = {}) {
  const ownership = String(sourceOwnership || "").trim().toLowerCase();

  if (ownership === "personal" || whatsappOwnerUserId || campaignOwnerUserId) {
    return {
      mode: "direct",
      ownerUserId: whatsappOwnerUserId || campaignOwnerUserId || null,
      roundRobinEligible: false,
      reason: "PERSONAL_SOURCE_DIRECT_OWNERSHIP"
    };
  }

  return {
    mode: "organization",
    ownerUserId: null,
    roundRobinEligible: true,
    reason: "ORGANIZATION_SOURCE_ASSIGNMENT"
  };
}

module.exports = {
  CAPABILITY_KEYS,
  DEFAULT_AGENT_CAPABILITIES,
  normalizeAgentCapabilities,
  resolveAgentCapabilitiesFromUser,
  mergeAgentCapabilitiesPatch,
  evaluateAgentWorkspaceReadiness,
  resolveLeadOwnershipMode
};
