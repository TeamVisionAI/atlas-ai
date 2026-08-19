/**
 * Sprint 16.1 — Bridge legacy phone-based prospects to Atlas Core Prospect Engine.
 * Implements BR-120 — canonical prospect identity (core UUID as system of record).
 *
 * Authority is always organizationId + normalized phone (never phone-global).
 */

const { normalizePhoneNumber } = require("./phoneNormalizer");
const { getRecruitingWorkflowDeps, isRecruitingWorkflowReady } = require("./recruitingWorkflowRegistry");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

/** @type {Map<string, string>} cache key = organizationId::phone → coreProspectId */
const orgPhoneToProspectId = new Map();

const REASON_CODES = Object.freeze({
  OK: null,
  UNRESOLVED: "PROSPECT_IDENTITY_UNRESOLVED",
  ORG_MISMATCH: "PROSPECT_IDENTITY_ORG_MISMATCH",
  AMBIGUOUS: "PROSPECT_IDENTITY_AMBIGUOUS",
  CONFLICT: "PROSPECT_IDENTITY_CONFLICT",
  ENSURE_FAILED: "PROSPECT_IDENTITY_ENSURE_FAILED",
  SCOPE_REQUIRED: "PROSPECT_IDENTITY_SCOPE_REQUIRED"
});

function normalizeStoragePhone(phone) {
  const normalized = normalizePhoneNumber(phone);
  return normalized ? `+${normalized}` : String(phone || "").trim();
}

function buildCacheKey(organizationId, phone) {
  return `${organizationId || ""}::${normalizeStoragePhone(phone)}`;
}

function rememberProspectMapping(phone, prospectId, organizationId = DEFAULT_ORGANIZATION_ID) {
  if (!phone || !prospectId || !organizationId) {
    return;
  }

  orgPhoneToProspectId.set(buildCacheKey(organizationId, phone), prospectId);
}

function readCachedCoreProspectId(phone, organizationId) {
  if (!phone || !organizationId) {
    return null;
  }
  return orgPhoneToProspectId.get(buildCacheKey(organizationId, phone)) || null;
}

function emptyIdentity({
  phone = null,
  organizationId = null,
  legacyProspectId = null,
  reasonCode = REASON_CODES.UNRESOLVED,
  ok = false
} = {}) {
  return {
    ok,
    reasonCode,
    phone,
    organizationId,
    coreProspectId: null,
    legacyProspectId: legacyProspectId || null,
    coreCreated: false,
    coreSkipped: false,
    identityIds: legacyProspectId ? [legacyProspectId] : []
  };
}

function successIdentity({
  phone,
  organizationId,
  coreProspectId,
  legacyProspectId = null,
  coreCreated = false,
  coreSkipped = false,
  reasonCode = REASON_CODES.OK
}) {
  const identityIds = [...new Set([coreProspectId, legacyProspectId].filter(Boolean))];
  return {
    ok: true,
    reasonCode,
    phone,
    organizationId,
    coreProspectId,
    legacyProspectId: legacyProspectId || null,
    coreCreated,
    coreSkipped,
    identityIds
  };
}

/**
 * List core prospects for phone within one org (injectable in tests).
 */
async function defaultListCoreByPhoneInOrganization(phone, organizationId) {
  if (!phone || !organizationId || !isRecruitingWorkflowReady()) {
    return [];
  }

  const { prospectRepository } = getRecruitingWorkflowDeps();
  if (typeof prospectRepository.findAllByPhoneInOrganization === "function") {
    return prospectRepository.findAllByPhoneInOrganization(phone, organizationId);
  }

  // Fallback: global phone lookup then filter (still never returns foreign-org as match).
  const existing = await prospectRepository.findByPhone(phone);
  if (!existing?.prospectId) {
    return [];
  }
  if (existing.organizationId && existing.organizationId !== organizationId) {
    return [];
  }
  return [existing];
}

/**
 * List core prospects for phone across orgs (mismatch detection only).
 */
async function defaultListCoreByPhoneAnyOrganization(phone) {
  if (!phone || !isRecruitingWorkflowReady()) {
    return [];
  }

  const { prospectRepository } = getRecruitingWorkflowDeps();
  if (typeof prospectRepository.findAllByPhone === "function") {
    return prospectRepository.findAllByPhone(phone);
  }

  const existing = await prospectRepository.findByPhone(phone);
  return existing?.prospectId ? [existing] : [];
}

/**
 * Org-scoped core id lookup. Never returns another org's core UUID.
 * On ambiguity → null (callers using resolveCanonical get AMBIGUOUS reason).
 *
 * @param {string} phone
 * @param {string} [organizationId]
 * @param {{ listInOrg?: Function, listAnyOrg?: Function }} [deps]
 */
async function findCoreProspectIdByPhone(
  phone,
  organizationId = DEFAULT_ORGANIZATION_ID,
  deps = {}
) {
  const storagePhone = normalizeStoragePhone(phone);
  const resolvedOrganizationId = organizationId || DEFAULT_ORGANIZATION_ID;

  const cached = readCachedCoreProspectId(storagePhone, resolvedOrganizationId);
  if (cached) {
    return cached;
  }

  const listInOrg =
    deps.listInOrg || defaultListCoreByPhoneInOrganization;
  const matches = await listInOrg(storagePhone, resolvedOrganizationId);

  if (!matches || matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    return null;
  }

  const match = matches[0];
  const prospectId = match.prospectId || match.id || null;
  const matchOrg = match.organizationId || match.organization_id || null;

  if (!prospectId) {
    return null;
  }

  if (matchOrg && matchOrg !== resolvedOrganizationId) {
    return null;
  }

  rememberProspectMapping(storagePhone, prospectId, resolvedOrganizationId);
  return prospectId;
}

async function ensureCoreProspectForLegacyLead({
  phone,
  displayName,
  email = null,
  leadSource = { sourceType: "social", sourceDetail: "Facebook Lead Ads" },
  actor = "SYSTEM",
  organizationId = null,
  listInOrg = null
} = {}) {
  const storagePhone = normalizeStoragePhone(phone);
  const resolvedOrganizationId = organizationId || DEFAULT_ORGANIZATION_ID;
  const existingId = await findCoreProspectIdByPhone(storagePhone, resolvedOrganizationId, {
    listInOrg
  });

  if (existingId) {
    return {
      prospectId: existingId,
      created: false,
      organizationId: resolvedOrganizationId,
      ok: true,
      reasonCode: REASON_CODES.OK
    };
  }

  // Ambiguity / foreign-org phone must not be papered over with a create.
  const inOrg = await (listInOrg || defaultListCoreByPhoneInOrganization)(
    storagePhone,
    resolvedOrganizationId
  );
  if (inOrg.length > 1) {
    return {
      prospectId: null,
      created: false,
      organizationId: resolvedOrganizationId,
      ok: false,
      reasonCode: REASON_CODES.AMBIGUOUS
    };
  }

  const anyOrg = await defaultListCoreByPhoneAnyOrganization(storagePhone);
  const foreign = (anyOrg || []).filter(
    (row) => (row.organizationId || row.organization_id) !== resolvedOrganizationId
  );
  if (foreign.length > 0 && inOrg.length === 0) {
    return {
      prospectId: null,
      created: false,
      organizationId: resolvedOrganizationId,
      ok: false,
      reasonCode: REASON_CODES.ORG_MISMATCH
    };
  }

  if (!isRecruitingWorkflowReady()) {
    return {
      prospectId: null,
      created: false,
      skipped: true,
      organizationId: resolvedOrganizationId,
      ok: false,
      reasonCode: REASON_CODES.ENSURE_FAILED
    };
  }

  try {
    const { prospectService } = getRecruitingWorkflowDeps();
    const created = await prospectService.createProspect(
      resolvedOrganizationId,
      {
        displayName: displayName || storagePhone,
        primaryPhone: storagePhone,
        email: email || undefined,
        leadSource,
        tags: ["autonomous-recruiting"],
        customFields: {
          intakeChannel: "facebook_lead",
          legacyPhone: storagePhone
        }
      },
      actor
    );

    const createdOrg = created.organizationId || resolvedOrganizationId;
    if (createdOrg !== resolvedOrganizationId || !created.prospectId) {
      return {
        prospectId: null,
        created: false,
        organizationId: resolvedOrganizationId,
        ok: false,
        reasonCode: REASON_CODES.ENSURE_FAILED
      };
    }

    rememberProspectMapping(storagePhone, created.prospectId, resolvedOrganizationId);

    return {
      prospectId: created.prospectId,
      created: true,
      organizationId: createdOrg,
      ok: true,
      reasonCode: REASON_CODES.OK
    };
  } catch (error) {
    const publicCode = error?.publicCode || error?.code || null;
    if (
      publicCode === "DUPLICATE_PHONE" ||
      String(error?.message || "").toLowerCase().includes("phone already exists")
    ) {
      return {
        prospectId: null,
        created: false,
        organizationId: resolvedOrganizationId,
        ok: false,
        reasonCode: REASON_CODES.ORG_MISMATCH
      };
    }
    return {
      prospectId: null,
      created: false,
      organizationId: resolvedOrganizationId,
      ok: false,
      reasonCode: REASON_CODES.ENSURE_FAILED
    };
  }
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
 * Resolve canonical (core) + legacy prospect identity for organizationId + phone.
 * Fail-closed on org mismatch, ambiguity, and conflicting legacy→core mapping.
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
  findLegacyByPhone = null,
  listInOrg = null,
  listAnyOrg = null,
  ensureCoreFn = null
} = {}) {
  if (!organizationId) {
    return emptyIdentity({
      phone: phone ? normalizeStoragePhone(phone) : null,
      organizationId: null,
      legacyProspectId,
      reasonCode: REASON_CODES.SCOPE_REQUIRED
    });
  }

  const resolvedOrganizationId = organizationId;
  const storagePhone = phone ? normalizeStoragePhone(phone) : null;

  if (!storagePhone) {
    return emptyIdentity({
      phone: null,
      organizationId: resolvedOrganizationId,
      legacyProspectId,
      reasonCode: REASON_CODES.UNRESOLVED
    });
  }

  const listIn =
    typeof listInOrg === "function" ? listInOrg : defaultListCoreByPhoneInOrganization;
  const listAny =
    typeof listAnyOrg === "function" ? listAnyOrg : defaultListCoreByPhoneAnyOrganization;

  const inOrgMatches = await listIn(storagePhone, resolvedOrganizationId);

  if (inOrgMatches.length > 1) {
    return emptyIdentity({
      phone: storagePhone,
      organizationId: resolvedOrganizationId,
      legacyProspectId,
      reasonCode: REASON_CODES.AMBIGUOUS
    });
  }

  let coreProspectId = null;
  if (inOrgMatches.length === 1) {
    const match = inOrgMatches[0];
    const matchOrg = match.organizationId || match.organization_id || null;
    const matchId = match.prospectId || match.id || null;
    if (matchOrg && matchOrg !== resolvedOrganizationId) {
      return emptyIdentity({
        phone: storagePhone,
        organizationId: resolvedOrganizationId,
        legacyProspectId,
        reasonCode: REASON_CODES.ORG_MISMATCH
      });
    }
    coreProspectId = matchId;
    if (coreProspectId) {
      rememberProspectMapping(storagePhone, coreProspectId, resolvedOrganizationId);
    }
  } else {
    // Zero in-org — check whether phone belongs to another org (explicit mismatch).
    const anyMatches = await listAny(storagePhone);
    const foreign = (anyMatches || []).filter((row) => {
      const org = row.organizationId || row.organization_id || null;
      return org && org !== resolvedOrganizationId;
    });
    if (foreign.length > 0) {
      return emptyIdentity({
        phone: storagePhone,
        organizationId: resolvedOrganizationId,
        legacyProspectId,
        reasonCode: REASON_CODES.ORG_MISMATCH
      });
    }

    // Also check cache must not leak: Org B must never read Org A cache (keyed by org).
    coreProspectId = readCachedCoreProspectId(storagePhone, resolvedOrganizationId);
  }

  let coreCreated = false;
  let coreSkipped = false;

  if (!coreProspectId && ensureCore) {
    const ensure =
      typeof ensureCoreFn === "function"
        ? ensureCoreFn
        : ensureCoreProspectForLegacyLead;
    const ensured = await ensure({
      phone: storagePhone,
      displayName,
      email,
      organizationId: resolvedOrganizationId,
      listInOrg: listIn
    });

    if (!ensured.ok || !ensured.prospectId) {
      return emptyIdentity({
        phone: storagePhone,
        organizationId: resolvedOrganizationId,
        legacyProspectId,
        reasonCode: ensured.reasonCode || REASON_CODES.ENSURE_FAILED
      });
    }

    coreProspectId = ensured.prospectId;
    coreCreated = Boolean(ensured.created);
    coreSkipped = Boolean(ensured.skipped);
    rememberProspectMapping(storagePhone, coreProspectId, resolvedOrganizationId);
  }

  if (!coreProspectId && !ensureCore) {
    return emptyIdentity({
      phone: storagePhone,
      organizationId: resolvedOrganizationId,
      legacyProspectId,
      reasonCode: REASON_CODES.UNRESOLVED
    });
  }

  let resolvedLegacyId = legacyProspectId || null;
  const finder =
    typeof findLegacyByPhone === "function"
      ? findLegacyByPhone
      : defaultFindLegacyProspectByPhone;
  const legacy = await finder(storagePhone, resolvedOrganizationId);
  const lookedUpLegacyId = legacy?.id || null;

  if (
    resolvedLegacyId &&
    lookedUpLegacyId &&
    resolvedLegacyId !== lookedUpLegacyId
  ) {
    return emptyIdentity({
      phone: storagePhone,
      organizationId: resolvedOrganizationId,
      legacyProspectId: resolvedLegacyId,
      reasonCode: REASON_CODES.CONFLICT
    });
  }

  if (!resolvedLegacyId) {
    resolvedLegacyId = lookedUpLegacyId;
  }

  if (!coreProspectId) {
    return emptyIdentity({
      phone: storagePhone,
      organizationId: resolvedOrganizationId,
      legacyProspectId: resolvedLegacyId,
      reasonCode: REASON_CODES.UNRESOLVED
    });
  }

  return successIdentity({
    phone: storagePhone,
    organizationId: resolvedOrganizationId,
    coreProspectId,
    legacyProspectId: resolvedLegacyId,
    coreCreated,
    coreSkipped
  });
}

module.exports = {
  REASON_CODES,
  normalizeStoragePhone,
  buildCacheKey,
  rememberProspectMapping,
  findCoreProspectIdByPhone,
  ensureCoreProspectForLegacyLead,
  resolveCanonicalProspectIdentity,
  clearProspectBridgeCacheForTests() {
    orgPhoneToProspectId.clear();
  }
};
