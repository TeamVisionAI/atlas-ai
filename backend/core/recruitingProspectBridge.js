/**
 * Sprint 16.1 — Bridge legacy phone-based prospects to Atlas Core Prospect Engine.
 * Implements BR-120 — canonical prospect identity (core UUID as system of record).
 */

const { normalizePhoneNumber } = require("./phoneNormalizer");
const { getRecruitingWorkflowDeps, isRecruitingWorkflowReady } = require("./recruitingWorkflowRegistry");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

const phoneToProspectId = new Map();

function normalizeStoragePhone(phone) {
  const normalized = normalizePhoneNumber(phone);
  return normalized ? `+${normalized}` : String(phone || "").trim();
}

function rememberProspectMapping(phone, prospectId) {
  if (!phone || !prospectId) {
    return;
  }

  phoneToProspectId.set(normalizeStoragePhone(phone), prospectId);
}

async function findCoreProspectIdByPhone(phone) {
  const storagePhone = normalizeStoragePhone(phone);

  if (phoneToProspectId.has(storagePhone)) {
    return phoneToProspectId.get(storagePhone);
  }

  if (!isRecruitingWorkflowReady()) {
    return null;
  }

  const { prospectRepository } = getRecruitingWorkflowDeps();
  const existing = await prospectRepository.findByPhone(storagePhone);

  if (existing?.prospectId) {
    rememberProspectMapping(storagePhone, existing.prospectId);
    return existing.prospectId;
  }

  return null;
}

async function ensureCoreProspectForLegacyLead({
  phone,
  displayName,
  email = null,
  leadSource = { sourceType: "social", sourceDetail: "Facebook Lead Ads" },
  actor = "SYSTEM",
  organizationId = null
}) {
  const storagePhone = normalizeStoragePhone(phone);
  const existingId = await findCoreProspectIdByPhone(storagePhone);
  const resolvedOrganizationId = organizationId || DEFAULT_ORGANIZATION_ID;

  if (existingId) {
    return {
      prospectId: existingId,
      created: false,
      organizationId: resolvedOrganizationId
    };
  }

  if (!isRecruitingWorkflowReady()) {
    return { prospectId: null, created: false, skipped: true, organizationId: resolvedOrganizationId };
  }

  const { prospectService } = getRecruitingWorkflowDeps();
  const created = await prospectService.createProspect(
    {
      displayName: displayName || storagePhone,
      primaryPhone: storagePhone,
      email: email || undefined,
      organizationId: resolvedOrganizationId,
      leadSource,
      tags: ["autonomous-recruiting"],
      customFields: {
        intakeChannel: "facebook_lead",
        legacyPhone: storagePhone
      }
    },
    actor
  );

  rememberProspectMapping(storagePhone, created.prospectId);

  return {
    prospectId: created.prospectId,
    created: true,
    organizationId: created.organizationId || resolvedOrganizationId
  };
}

async function defaultFindLegacyProspectByPhone(phone, organizationId) {
  if (!phone || !organizationId) {
    return null;
  }

  try {
    const { findProspectInOrganization } = require("../services/supabaseService");
    return await findProspectInOrganization(phone, organizationId);
  } catch {
    return null;
  }
}

/**
 * Resolve canonical (core) + legacy prospect identity for a phone / org.
 * Core UUID is the system of record for appointment FK + new durable context keys.
 * Legacy `prospects.id` remains the WhatsApp phone profile / workflow cache id.
 *
 * Implements BR-120.
 */
async function resolveCanonicalProspectIdentity({
  phone = null,
  organizationId = null,
  displayName = null,
  email = null,
  legacyProspectId = null,
  ensureCore = true,
  findLegacyByPhone = null
} = {}) {
  const resolvedOrganizationId = organizationId || DEFAULT_ORGANIZATION_ID;
  const storagePhone = phone ? normalizeStoragePhone(phone) : null;

  let coreProspectId = storagePhone ? await findCoreProspectIdByPhone(storagePhone) : null;
  let coreCreated = false;
  let coreSkipped = false;

  if (!coreProspectId && storagePhone && ensureCore) {
    const ensured = await ensureCoreProspectForLegacyLead({
      phone: storagePhone,
      displayName,
      email,
      organizationId: resolvedOrganizationId
    });
    coreProspectId = ensured.prospectId || null;
    coreCreated = Boolean(ensured.created);
    coreSkipped = Boolean(ensured.skipped);
  }

  let resolvedLegacyId = legacyProspectId || null;
  if (!resolvedLegacyId && storagePhone) {
    const finder = typeof findLegacyByPhone === "function"
      ? findLegacyByPhone
      : defaultFindLegacyProspectByPhone;
    const legacy = await finder(storagePhone, resolvedOrganizationId);
    resolvedLegacyId = legacy?.id || null;
  }

  const identityIds = [...new Set([coreProspectId, resolvedLegacyId].filter(Boolean))];

  return {
    phone: storagePhone,
    organizationId: resolvedOrganizationId,
    coreProspectId,
    legacyProspectId: resolvedLegacyId,
    coreCreated,
    coreSkipped,
    identityIds
  };
}

module.exports = {
  normalizeStoragePhone,
  rememberProspectMapping,
  findCoreProspectIdByPhone,
  ensureCoreProspectForLegacyLead,
  resolveCanonicalProspectIdentity,
  clearProspectBridgeCacheForTests() {
    phoneToProspectId.clear();
  }
};
