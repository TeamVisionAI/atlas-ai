/**
 * QR Channel Phase 1 application service (BR-128 / BR-129).
 * Campaign resolve, scan create, phone-bind — no inbound consume, no appointments.
 */

const { normalizePhoneNumber } = require("../phoneNormalizer");
const {
  CAMPAIGN_STATUS,
  HANDOFF_MODE,
  SCAN_STATUS,
  SCAN_TTL_MS,
  REASON_CODES,
  NATURAL_WHATSAPP_PREFILL
} = require("./constants");
const {
  hashPublicToken,
  isPlausiblePublicToken,
  createBindMac,
  verifyBindMac,
  resolveBindSecret,
  generatePublicToken,
  tokenPrefix
} = require("./tokenCrypto");
const { buildWhatsAppRedirectUrl } = require("./whatsappRedirect");
const { emitQrEvent, EVENTS } = require("./qrChannelTelemetry");

function isExpired(scan, now = new Date()) {
  if (!scan?.expires_at) return true;
  return new Date(scan.expires_at).getTime() <= now.getTime();
}

function isValidWhatsAppPhoneNormalized(normalized) {
  if (!normalized) return false;
  // US + country: 11 digits starting with 1, or 10–15 international digits.
  if (/^1\d{10}$/.test(normalized)) return true;
  if (/^\d{10,15}$/.test(normalized) && !normalized.startsWith("0")) return true;
  return false;
}

function createQrCampaignService({ repository, env = process.env, nowFn = () => new Date() } = {}) {
  if (!repository) {
    throw new Error("qrCampaignService requires repository");
  }

  const bindSecret = () => resolveBindSecret(env);

  async function resolvePublicToken(rawToken) {
    emitQrEvent(EVENTS.SCAN_RECEIVED, { outcome: "received" });

    if (!isPlausiblePublicToken(rawToken)) {
      emitQrEvent(EVENTS.SCAN_INVALID, {
        reasonCode: REASON_CODES.TOKEN_INVALID,
        outcome: "invalid_token"
      });
      return { ok: false, reasonCode: REASON_CODES.TOKEN_INVALID };
    }

    const tokenHash = hashPublicToken(rawToken);
    const campaign = await repository.findCampaignByTokenHash(tokenHash);
    if (!campaign) {
      emitQrEvent(EVENTS.SCAN_INVALID, {
        reasonCode: REASON_CODES.CAMPAIGN_NOT_FOUND,
        outcome: "not_found"
      });
      // Enumeration resistance: same public reason as invalid token
      return { ok: false, reasonCode: REASON_CODES.TOKEN_INVALID };
    }

    if (!campaign.owner_user_id) {
      emitQrEvent(EVENTS.SCAN_INVALID, {
        organizationId: campaign.org_id,
        campaignId: campaign.id,
        reasonCode: REASON_CODES.OWNER_MISSING,
        outcome: "owner_missing"
      });
      return { ok: false, reasonCode: REASON_CODES.OWNER_MISSING, campaign };
    }

    if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
      emitQrEvent(EVENTS.SCAN_INACTIVE, {
        organizationId: campaign.org_id,
        campaignId: campaign.id,
        campaignKey: campaign.campaign_key,
        source: campaign.source,
        reasonCode: REASON_CODES.CAMPAIGN_INACTIVE,
        outcome: "inactive"
      });
      return { ok: false, reasonCode: REASON_CODES.CAMPAIGN_INACTIVE, campaign };
    }

    emitQrEvent(EVENTS.SCAN_RESOLVED, {
      organizationId: campaign.org_id,
      campaignId: campaign.id,
      campaignKey: campaign.campaign_key,
      source: campaign.source,
      outcome: "resolved"
    });

    return { ok: true, reasonCode: REASON_CODES.OK, campaign };
  }

  async function beginScanForCampaign(campaign) {
    const now = nowFn();
    const expiresAt = new Date(now.getTime() + SCAN_TTL_MS).toISOString();
    const scan = await repository.insertScan({
      campaign_id: campaign.id,
      org_id: campaign.org_id,
      handoff_mode: HANDOFF_MODE.PHONE_BIND,
      status: SCAN_STATUS.PENDING_PHONE,
      bound_phone_normalized: null,
      handoff_code_hash: null,
      expires_at: expiresAt,
      redirect_result: "interstitial"
    });

    const mac = createBindMac(scan.id, scan.expires_at, bindSecret());

    return {
      ok: true,
      scan,
      bindMac: mac,
      campaign,
      expiresAt: scan.expires_at
    };
  }

  async function startPublicEntry(rawToken) {
    const resolved = await resolvePublicToken(rawToken);
    if (!resolved.ok) {
      return resolved;
    }
    const begun = await beginScanForCampaign(resolved.campaign);
    emitQrEvent(EVENTS.SCAN_RESOLVED, {
      organizationId: resolved.campaign.org_id,
      campaignId: resolved.campaign.id,
      correlationId: begun.scan.correlation_id,
      scanId: begun.scan.id,
      source: resolved.campaign.source,
      outcome: "scan_created"
    });
    return {
      ok: true,
      reasonCode: REASON_CODES.OK,
      campaign: resolved.campaign,
      scan: begun.scan,
      bindMac: begun.bindMac
    };
  }

  async function bindPhoneAndRedirect({
    scanId,
    bindMac,
    rawPhone,
    expectedOrgId = null
  }) {
    const scan = await repository.findScanById(scanId);
    if (!scan) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        reasonCode: REASON_CODES.SCAN_NOT_FOUND,
        outcome: "scan_not_found"
      });
      return { ok: false, reasonCode: REASON_CODES.SCAN_NOT_FOUND };
    }

    if (expectedOrgId && scan.org_id !== expectedOrgId) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: scan.org_id,
        scanId: scan.id,
        reasonCode: REASON_CODES.ORG_MISMATCH,
        outcome: "org_mismatch"
      });
      return { ok: false, reasonCode: REASON_CODES.ORG_MISMATCH };
    }

    if (!verifyBindMac(scan.id, scan.expires_at, bindMac, bindSecret())) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: scan.org_id,
        scanId: scan.id,
        correlationId: scan.correlation_id,
        reasonCode: REASON_CODES.BIND_MAC_INVALID,
        outcome: "bind_mac_invalid"
      });
      return { ok: false, reasonCode: REASON_CODES.BIND_MAC_INVALID };
    }

    if (isExpired(scan, nowFn())) {
      await repository.updateScan(scan.id, { status: SCAN_STATUS.EXPIRED });
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: scan.org_id,
        campaignId: scan.campaign_id,
        correlationId: scan.correlation_id,
        scanId: scan.id,
        reasonCode: REASON_CODES.SCAN_EXPIRED,
        outcome: "expired"
      });
      return { ok: false, reasonCode: REASON_CODES.SCAN_EXPIRED };
    }

    if (scan.status !== SCAN_STATUS.PENDING_PHONE) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: scan.org_id,
        campaignId: scan.campaign_id,
        correlationId: scan.correlation_id,
        scanId: scan.id,
        reasonCode: REASON_CODES.SCAN_WRONG_STATUS,
        outcome: "wrong_status"
      });
      return { ok: false, reasonCode: REASON_CODES.SCAN_WRONG_STATUS };
    }

    const campaign = await repository.findCampaignById(scan.campaign_id);
    if (!campaign || campaign.org_id !== scan.org_id) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: scan.org_id,
        reasonCode: REASON_CODES.ORG_MISMATCH,
        outcome: "campaign_org_mismatch"
      });
      return { ok: false, reasonCode: REASON_CODES.ORG_MISMATCH };
    }

    if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: campaign.org_id,
        campaignId: campaign.id,
        reasonCode: REASON_CODES.CAMPAIGN_INACTIVE,
        outcome: "inactive"
      });
      return { ok: false, reasonCode: REASON_CODES.CAMPAIGN_INACTIVE };
    }

    const normalized = normalizePhoneNumber(rawPhone);
    if (!isValidWhatsAppPhoneNormalized(normalized)) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: campaign.org_id,
        campaignId: campaign.id,
        correlationId: scan.correlation_id,
        scanId: scan.id,
        reasonCode: REASON_CODES.PHONE_INVALID,
        outcome: "phone_invalid"
      });
      return { ok: false, reasonCode: REASON_CODES.PHONE_INVALID };
    }

    await repository.supersedeOpenScansExcept({
      orgId: scan.org_id,
      phoneNormalized: normalized,
      exceptScanId: scan.id
    });

    const boundAt = nowFn().toISOString();
    const updated = await repository.updateScan(scan.id, {
      bound_phone_normalized: normalized,
      bound_at: boundAt,
      status: SCAN_STATUS.PENDING_INBOUND,
      redirect_result: "redirected"
    });

    const redirect = buildWhatsAppRedirectUrl({
      campaignWhatsAppE164: campaign.whatsapp_e164,
      env,
      prefill: NATURAL_WHATSAPP_PREFILL
    });

    if (!redirect.ok) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        organizationId: campaign.org_id,
        campaignId: campaign.id,
        correlationId: scan.correlation_id,
        scanId: scan.id,
        reasonCode: redirect.reasonCode,
        outcome: "redirect_blocked"
      });
      return { ok: false, reasonCode: redirect.reasonCode };
    }

    emitQrEvent(EVENTS.PHONE_BIND_SUCCEEDED, {
      organizationId: campaign.org_id,
      campaignId: campaign.id,
      correlationId: scan.correlation_id,
      scanId: scan.id,
      source: campaign.source,
      outcome: "bound"
    });
    emitQrEvent(EVENTS.REDIRECT_WHATSAPP, {
      organizationId: campaign.org_id,
      campaignId: campaign.id,
      correlationId: scan.correlation_id,
      scanId: scan.id,
      source: campaign.source,
      outcome: "redirect"
    });

    return {
      ok: true,
      reasonCode: REASON_CODES.OK,
      scan: updated,
      campaign,
      redirectUrl: redirect.url,
      prefill: redirect.prefill,
      e164: redirect.e164
    };
  }

  async function seedCampaign({
    orgId,
    ownerUserId,
    campaignKey,
    name,
    source,
    campaignType,
    defaultConversationGoal,
    whatsappE164 = null,
    status = CAMPAIGN_STATUS.ACTIVE
  }) {
    const existing = await repository.findCampaignByOrgAndKey(orgId, campaignKey);
    if (existing) {
      return {
        ok: true,
        created: false,
        campaign: existing,
        publicToken: null,
        message: "Campaign already exists; plaintext token is not recoverable from hash"
      };
    }

    if (!ownerUserId) {
      return { ok: false, reasonCode: REASON_CODES.OWNER_MISSING };
    }

    const publicToken = generatePublicToken();
    const public_token_hash = hashPublicToken(publicToken);
    const campaign = await repository.insertCampaign({
      org_id: orgId,
      owner_user_id: ownerUserId,
      name,
      campaign_key: campaignKey,
      source,
      campaign_type: campaignType,
      default_conversation_goal: defaultConversationGoal,
      public_token_hash,
      public_token_prefix: tokenPrefix(publicToken),
      status,
      destination_channel: "whatsapp",
      whatsapp_e164: whatsappE164
    });

    return {
      ok: true,
      created: true,
      campaign,
      publicToken,
      message: "Store publicToken securely once — only the hash is persisted"
    };
  }

  return {
    resolvePublicToken,
    beginScanForCampaign,
    startPublicEntry,
    bindPhoneAndRedirect,
    seedCampaign,
    isExpired,
    isValidWhatsAppPhoneNormalized
  };
}

module.exports = {
  createQrCampaignService,
  isValidWhatsAppPhoneNormalized,
  isExpired
};
