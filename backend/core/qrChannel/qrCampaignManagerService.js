/**
 * QR Campaign Manager Phase A — org-scoped campaign CRUD + QR assets.
 * Does not change public /go resolution or Phase 2 attribution semantics.
 */

const crypto = require("crypto");
const {
  CAMPAIGN_STATUS,
  TEAM_VISION_ORG_ID
} = require("./constants");
const {
  generatePublicToken,
  hashPublicToken,
  tokenPrefix,
  isPlausiblePublicToken
} = require("./tokenCrypto");
const {
  isTokenEncryptionConfigured,
  encryptPublicToken,
  decryptPublicToken
} = require("./tokenEncryption");
const { isQrCampaignManagerEnabledForOrg } = require("./qrCampaignManagerConfig");
const {
  isAllowedCampaignType,
  sourceForCampaignType,
  labelForCampaignType,
  CAMPAIGN_TYPES
} = require("./qrCampaignTypes");
const { renderQrPngBuffer, renderQrSvgString } = require("./qrImageService");
const { emitQrEvent, EVENTS } = require("./qrChannelTelemetry");
const {
  isEligibleNewLeadOwner
} = require("../newLeadAssignmentEngine");
const { listAssignableRepresentatives } = require("../personnelDirectoryEngine");
const { hasPermission } = require("../../security/authorizationService");
const { PERMISSIONS } = require("../../security/permissions");
const { normalizeRole } = require("../../security/roles");
const { toLegacyRole } = require("../../security/saasRoles");

const REASON = Object.freeze({
  OK: "OK",
  FEATURE_DISABLED: "QR_CAMPAIGN_MANAGER_DISABLED",
  ENCRYPTION_KEY_UNAVAILABLE: "ENCRYPTION_KEY_UNAVAILABLE",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  OWNER_INELIGIBLE: "OWNER_INELIGIBLE",
  OWNER_CROSS_ORG: "OWNER_CROSS_ORG",
  LEGACY_REDOWNLOAD_UNAVAILABLE: "LEGACY_REDOWNLOAD_UNAVAILABLE",
  PUBLIC_HOST_MISSING: "PUBLIC_HOST_MISSING"
});

function resolvePublicAtlasOrigin(env = process.env) {
  const raw =
    String(env.ATLAS_PUBLIC_URL || "").trim() ||
    String(env.ATLAS_PUBLIC_HOST || "").trim() ||
    "";
  if (!raw) {
    return null;
  }
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function buildPublicGoUrl(origin, token) {
  return `${origin.replace(/\/$/, "")}/go/${token}`;
}

function slugifyCampaignKey(name) {
  const base = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomBytes(3).toString("hex");
  const key = `${base || "campaign"}_${suffix}`;
  return key.slice(0, 64);
}

function legacyRoleOf(user) {
  return normalizeRole(user?.role) || toLegacyRole(user?.role) || "recruiter";
}

function isAdministrator(user) {
  return legacyRoleOf(user) === "administrator";
}

function canManageOrgCampaigns(authContext) {
  return (
    hasPermission(authContext, PERMISSIONS.PROSPECT_ASSIGN) ||
    hasPermission(authContext, PERMISSIONS.ADMIN_USERS) ||
    authContext?.role === "administrator" ||
    isAdministrator(authContext?.user)
  );
}

function sanitizeCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    ownerUserId: row.owner_user_id,
    createdByUserId: row.created_by_user_id || null,
    name: row.name,
    description: row.description || null,
    campaignKey: row.campaign_key,
    campaignType: row.campaign_type,
    campaignTypeLabel: labelForCampaignType(row.campaign_type),
    source: row.source,
    defaultConversationGoal: row.default_conversation_goal,
    status: row.status,
    publicTokenPrefix: row.public_token_prefix || null,
    tokenVersion: row.token_version == null ? 1 : row.token_version,
    hasEncryptedToken: Boolean(row.encrypted_public_token),
    legacyRedownloadUnavailable: !row.encrypted_public_token,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createQrCampaignManagerService({
  repository,
  env = process.env,
  atlasUserService = null,
  listAssignable = listAssignableRepresentatives
} = {}) {
  if (!repository) {
    throw new Error("qrCampaignManagerService requires repository");
  }

  function loadUserService() {
    return atlasUserService || require("../../services/atlasUserService");
  }

  function featureGate(organizationId) {
    return isQrCampaignManagerEnabledForOrg(organizationId, env);
  }

  function canViewCampaign(authContext, campaign) {
    if (!campaign) return false;
    if (String(campaign.org_id) !== String(authContext.organizationId)) {
      return false;
    }
    if (canManageOrgCampaigns(authContext)) {
      return true;
    }
    return String(campaign.owner_user_id) === String(authContext.userId);
  }

  function canMutateCampaign(authContext, campaign) {
    return canViewCampaign(authContext, campaign);
  }

  async function resolveOwnerUserId({
    authContext,
    requestedOwnerUserId,
    organizationId
  }) {
    const actorId = authContext.userId;
    const requested = requestedOwnerUserId
      ? String(requestedOwnerUserId).trim()
      : "";

    if (!requested || requested === String(actorId)) {
      const actor = authContext.user;
      if (!isEligibleNewLeadOwner(actor, organizationId)) {
        return { ok: false, reason: REASON.OWNER_INELIGIBLE };
      }
      return { ok: true, ownerUserId: actorId };
    }

    if (!canManageOrgCampaigns(authContext)) {
      return { ok: false, reason: REASON.FORBIDDEN };
    }

    const users = loadUserService();
    const owner = await users.findUserById(requested).catch(() => null);
    if (!owner) {
      return { ok: false, reason: REASON.OWNER_INELIGIBLE };
    }
    const ownerOrg = owner.organization_id || owner.organizationId || null;
    if (ownerOrg && String(ownerOrg) !== String(organizationId)) {
      return { ok: false, reason: REASON.OWNER_CROSS_ORG };
    }
    if (!isEligibleNewLeadOwner(owner, organizationId)) {
      return { ok: false, reason: REASON.OWNER_INELIGIBLE };
    }
    return { ok: true, ownerUserId: owner.id };
  }

  async function listCampaigns(authContext) {
    const organizationId = authContext.organizationId;
    const gate = featureGate(organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    const ownerFilter = canManageOrgCampaigns(authContext)
      ? null
      : authContext.userId;
    const rows = await repository.listCampaignsByOrg({
      orgId: organizationId,
      ownerUserId: ownerFilter
    });
    return {
      ok: true,
      reason: REASON.OK,
      campaigns: rows.map(sanitizeCampaign),
      campaignTypes: CAMPAIGN_TYPES,
      canCreateForOthers: canManageOrgCampaigns(authContext)
    };
  }

  async function getCampaign(authContext, campaignId) {
    const gate = featureGate(authContext.organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    const campaign = await repository.findCampaignById(campaignId);
    if (!campaign || !canViewCampaign(authContext, campaign)) {
      return { ok: false, reason: REASON.NOT_FOUND, status: 404 };
    }
    return { ok: true, reason: REASON.OK, campaign: sanitizeCampaign(campaign) };
  }

  async function createCampaign(authContext, input = {}) {
    const organizationId = authContext.organizationId;
    const gate = featureGate(organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    if (!isTokenEncryptionConfigured(env)) {
      return {
        ok: false,
        reason: REASON.ENCRYPTION_KEY_UNAVAILABLE,
        status: 503
      };
    }

    const origin = resolvePublicAtlasOrigin(env);
    if (!origin) {
      return { ok: false, reason: REASON.PUBLIC_HOST_MISSING, status: 503 };
    }

    const name = String(input.name || "").trim();
    const description =
      input.description == null ? null : String(input.description).trim().slice(0, 500) || null;
    const campaignType = String(input.campaignType || "").trim();

    if (!name || name.length < 2 || name.length > 120) {
      return {
        ok: false,
        reason: REASON.VALIDATION,
        message: "Campaign name must be 2–120 characters",
        status: 400
      };
    }
    if (!isAllowedCampaignType(campaignType)) {
      return {
        ok: false,
        reason: REASON.VALIDATION,
        message: "Invalid campaign type",
        status: 400
      };
    }

    const ownerResolved = await resolveOwnerUserId({
      authContext,
      requestedOwnerUserId: input.ownerUserId,
      organizationId
    });
    if (!ownerResolved.ok) {
      return {
        ok: false,
        reason: ownerResolved.reason,
        status: ownerResolved.reason === REASON.FORBIDDEN ? 403 : 400
      };
    }

    const publicToken = generatePublicToken();
    const public_token_hash = hashPublicToken(publicToken);
    let encrypted_public_token;
    try {
      encrypted_public_token = encryptPublicToken(publicToken, env);
    } catch (err) {
      return {
        ok: false,
        reason: REASON.ENCRYPTION_KEY_UNAVAILABLE,
        status: 503
      };
    }

    const campaignKey = slugifyCampaignKey(name);
    const row = await repository.insertCampaign({
      org_id: organizationId,
      owner_user_id: ownerResolved.ownerUserId,
      created_by_user_id: authContext.userId,
      name,
      description,
      campaign_key: campaignKey,
      source: sourceForCampaignType(campaignType),
      campaign_type: campaignType,
      default_conversation_goal: "interview",
      public_token_hash,
      public_token_prefix: tokenPrefix(publicToken),
      encrypted_public_token,
      token_version: 1,
      status: CAMPAIGN_STATUS.ACTIVE,
      destination_channel: "whatsapp",
      whatsapp_e164: null
    });

    const publicUrl = buildPublicGoUrl(origin, publicToken);

    emitQrEvent(EVENTS.CAMPAIGN_CREATED, {
      organizationId,
      campaignId: row.id,
      campaignKey: row.campaign_key,
      source: row.source,
      outcome: "created"
    });

    return {
      ok: true,
      reason: REASON.OK,
      campaign: sanitizeCampaign(row),
      publicUrl,
      // Create-only convenience; never persisted to frontend list storage by contract.
      previewAvailable: true
    };
  }

  async function patchCampaign(authContext, campaignId, patch = {}) {
    const gate = featureGate(authContext.organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    const campaign = await repository.findCampaignById(campaignId);
    if (!campaign || !canMutateCampaign(authContext, campaign)) {
      return { ok: false, reason: REASON.NOT_FOUND, status: 404 };
    }

    const updates = {};
    if (patch.name != null) {
      const name = String(patch.name).trim();
      if (!name || name.length < 2 || name.length > 120) {
        return { ok: false, reason: REASON.VALIDATION, status: 400 };
      }
      updates.name = name;
    }
    if (patch.description !== undefined) {
      updates.description =
        patch.description == null
          ? null
          : String(patch.description).trim().slice(0, 500) || null;
    }
    if (Object.keys(updates).length === 0) {
      return { ok: true, reason: REASON.OK, campaign: sanitizeCampaign(campaign) };
    }

    const updated = await repository.updateCampaign(campaign.id, updates);
    return { ok: true, reason: REASON.OK, campaign: sanitizeCampaign(updated) };
  }

  async function setCampaignStatus(authContext, campaignId, status) {
    const gate = featureGate(authContext.organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    if (status !== CAMPAIGN_STATUS.ACTIVE && status !== CAMPAIGN_STATUS.INACTIVE) {
      return { ok: false, reason: REASON.VALIDATION, status: 400 };
    }

    const campaign = await repository.findCampaignById(campaignId);
    if (!campaign || !canMutateCampaign(authContext, campaign)) {
      return { ok: false, reason: REASON.NOT_FOUND, status: 404 };
    }

    const updated = await repository.updateCampaign(campaign.id, { status });
    emitQrEvent(
      status === CAMPAIGN_STATUS.ACTIVE
        ? EVENTS.CAMPAIGN_ACTIVATED
        : EVENTS.CAMPAIGN_DEACTIVATED,
      {
        organizationId: campaign.org_id,
        campaignId: campaign.id,
        campaignKey: campaign.campaign_key,
        source: campaign.source,
        outcome: status
      }
    );
    return { ok: true, reason: REASON.OK, campaign: sanitizeCampaign(updated) };
  }

  async function unlockPublicToken(authContext, campaignId) {
    const gate = featureGate(authContext.organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    const campaign = await repository.findCampaignById(campaignId);
    if (!campaign || !canViewCampaign(authContext, campaign)) {
      return { ok: false, reason: REASON.NOT_FOUND, status: 404 };
    }

    if (!campaign.encrypted_public_token) {
      return {
        ok: false,
        reason: REASON.LEGACY_REDOWNLOAD_UNAVAILABLE,
        status: 409,
        message:
          "Legacy QR — existing printed code remains active. Re-download unavailable until a future controlled reissue."
      };
    }

    if (!isTokenEncryptionConfigured(env)) {
      return {
        ok: false,
        reason: REASON.ENCRYPTION_KEY_UNAVAILABLE,
        status: 503
      };
    }

    let token;
    try {
      token = decryptPublicToken(campaign.encrypted_public_token, env);
    } catch {
      return {
        ok: false,
        reason: REASON.ENCRYPTION_KEY_UNAVAILABLE,
        status: 503
      };
    }

    if (!isPlausiblePublicToken(token)) {
      return { ok: false, reason: REASON.VALIDATION, status: 500 };
    }

    const origin = resolvePublicAtlasOrigin(env);
    if (!origin) {
      return { ok: false, reason: REASON.PUBLIC_HOST_MISSING, status: 503 };
    }

    const expectedHash = hashPublicToken(token);
    if (expectedHash !== campaign.public_token_hash) {
      return { ok: false, reason: REASON.VALIDATION, status: 500 };
    }

    return {
      ok: true,
      reason: REASON.OK,
      token,
      publicUrl: buildPublicGoUrl(origin, token),
      campaign
    };
  }

  async function getPublicUrl(authContext, campaignId) {
    const unlocked = await unlockPublicToken(authContext, campaignId);
    if (!unlocked.ok) {
      return unlocked;
    }
    emitQrEvent(EVENTS.CAMPAIGN_PUBLIC_URL_ACCESSED, {
      organizationId: unlocked.campaign.org_id,
      campaignId: unlocked.campaign.id,
      campaignKey: unlocked.campaign.campaign_key,
      outcome: "public_url"
    });
    return {
      ok: true,
      reason: REASON.OK,
      publicUrl: unlocked.publicUrl,
      campaign: sanitizeCampaign(unlocked.campaign)
    };
  }

  async function getQrPng(authContext, campaignId) {
    const unlocked = await unlockPublicToken(authContext, campaignId);
    if (!unlocked.ok) return unlocked;
    const buffer = await renderQrPngBuffer(unlocked.publicUrl);
    emitQrEvent(EVENTS.CAMPAIGN_QR_DOWNLOADED, {
      organizationId: unlocked.campaign.org_id,
      campaignId: unlocked.campaign.id,
      campaignKey: unlocked.campaign.campaign_key,
      outcome: "png"
    });
    return {
      ok: true,
      reason: REASON.OK,
      contentType: "image/png",
      body: buffer,
      publicUrl: unlocked.publicUrl
    };
  }

  async function getQrSvg(authContext, campaignId) {
    const unlocked = await unlockPublicToken(authContext, campaignId);
    if (!unlocked.ok) return unlocked;
    const svg = await renderQrSvgString(unlocked.publicUrl);
    emitQrEvent(EVENTS.CAMPAIGN_QR_DOWNLOADED, {
      organizationId: unlocked.campaign.org_id,
      campaignId: unlocked.campaign.id,
      campaignKey: unlocked.campaign.campaign_key,
      outcome: "svg"
    });
    return {
      ok: true,
      reason: REASON.OK,
      contentType: "image/svg+xml; charset=utf-8",
      body: svg,
      publicUrl: unlocked.publicUrl
    };
  }

  async function listOwnerCandidates(authContext) {
    const gate = featureGate(authContext.organizationId);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason || REASON.FEATURE_DISABLED, status: 403 };
    }

    if (!canManageOrgCampaigns(authContext)) {
      return {
        ok: true,
        reason: REASON.OK,
        candidates: [
          {
            id: authContext.userId,
            displayName:
              authContext.user?.full_name ||
              authContext.user?.display_name ||
              authContext.user?.email ||
              "Me"
          }
        ],
        canCreateForOthers: false
      };
    }

    const reps = await listAssignable({
      organizationId: authContext.organizationId
    });
    return {
      ok: true,
      reason: REASON.OK,
      candidates: (reps || []).map((r) => ({
        id: r.id,
        displayName: r.displayName,
        role: r.role
      })),
      canCreateForOthers: true
    };
  }

  return {
    listCampaigns,
    getCampaign,
    createCampaign,
    patchCampaign,
    setCampaignStatus,
    getPublicUrl,
    getQrPng,
    getQrSvg,
    listOwnerCandidates,
    sanitizeCampaign,
    canManageOrgCampaigns,
    featureGate,
    // test helpers
    _internal: {
      resolvePublicAtlasOrigin,
      buildPublicGoUrl,
      slugifyCampaignKey,
      TEAM_VISION_ORG_ID
    }
  };
}

module.exports = {
  REASON,
  createQrCampaignManagerService,
  resolvePublicAtlasOrigin,
  buildPublicGoUrl,
  sanitizeCampaign,
  canManageOrgCampaigns
};
