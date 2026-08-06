/**
 * Sprint 16.1 — Bridge legacy phone-based prospects to Atlas Core Prospect Engine.
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

module.exports = {
  normalizeStoragePhone,
  rememberProspectMapping,
  findCoreProspectIdByPhone,
  ensureCoreProspectForLegacyLead,
  clearProspectBridgeCacheForTests() {
    phoneToProspectId.clear();
  }
};
