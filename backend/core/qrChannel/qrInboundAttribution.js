/**
 * QR Channel Phase 2 — inbound attribution match + consume + lead_source hydration (BR-129 / BR-130).
 * Exact org + pending_inbound + phone only. No query-param / text / IP correlation.
 */

"use strict";

const { SCAN_STATUS, CAMPAIGN_STATUS, REASON_CODES } = require("./constants");
const { emitQrEvent, EVENTS } = require("./qrChannelTelemetry");

const MATCH_OUTCOME = Object.freeze({
  HIT: "HIT",
  MISS: "MISS",
  AMBIGUOUS: "AMBIGUOUS"
});

const ATTRIBUTION_RESULT = Object.freeze({
  ATTACHED_NEW: "attached_new",
  ATTACHED_EXISTING: "attached_existing",
  HISTORICAL_INACTIVE_CAMPAIGN: "historical_inactive_campaign",
  IDEMPOTENT_REPLAY: "idempotent_replay"
});

function isExpired(scan, now = new Date()) {
  if (!scan?.expires_at) return true;
  return new Date(scan.expires_at).getTime() <= now.getTime();
}

function phoneTail(normalized) {
  const digits = String(normalized || "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
}

function resolveConversationGoal(existingLeadSource, campaignGoal) {
  const current =
    existingLeadSource?.conversationGoal ||
    existingLeadSource?.conversation_goal ||
    existingLeadSource?.goal ||
    null;
  const normalized = String(current || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "unresolved") {
    return campaignGoal || "interview";
  }
  return current;
}

/**
 * Merge trusted QR attribution into core lead_source JSONB.
 * firstTouch* immutable once set; lastTouch* always updated on trusted attach.
 */
function mergeQrAttributionIntoLeadSource(existingLeadSource, touch) {
  const existing =
    existingLeadSource && typeof existingLeadSource === "object"
      ? { ...existingLeadSource }
      : {};

  const nowIso = touch.touchedAt || new Date().toISOString();
  const campaignId = touch.campaignId;
  const source = touch.source || "car_magnet";
  const campaignKey = touch.campaignKey || null;
  const correlationId = touch.correlationId || null;

  const hasFirstTouch = Boolean(
    existing.firstTouchCampaignId || existing.firstTouchSource || existing.firstTouchAt
  );

  const conversationGoal = resolveConversationGoal(
    existing,
    touch.conversationGoal || "interview"
  );

  const next = {
    ...existing,
    sourceType: existing.sourceType || "social",
    sourceDetail: source,
    sourceConnectorId: existing.sourceConnectorId || null,
    acquiredAt: existing.acquiredAt || nowIso,
    entryMethod: "QR",
    source,
    campaignKey,
    campaignId,
    conversationGoal,
    lastTouchCampaignId: campaignId,
    lastTouchSource: source,
    lastTouchAt: nowIso
  };

  if (!hasFirstTouch) {
    next.firstTouchCampaignId = campaignId;
    next.firstTouchSource = source;
    next.firstTouchAt = nowIso;
    next.firstTouchCorrelationId = correlationId;
  }

  return next;
}

function createQrInboundAttributionService({
  repository,
  nowFn = () => new Date()
} = {}) {
  if (!repository) {
    throw new Error("qrInboundAttributionService requires repository");
  }

  /**
   * Match eligible pending_inbound scans for org + phone.
   * Does not consume.
   */
  async function matchEligiblePendingInboundScan({
    organizationId,
    phoneNormalized
  }) {
    const orgId = organizationId ? String(organizationId) : "";
    const phone = phoneNormalized ? String(phoneNormalized).trim() : "";

    if (!orgId || !phone) {
      emitQrEvent(EVENTS.ATTRIBUTION_MISSED, {
        organizationId: orgId || null,
        reasonCode: REASON_CODES.PHONE_INVALID,
        outcome: "missing_org_or_phone"
      });
      return {
        ok: false,
        outcome: MATCH_OUTCOME.MISS,
        reasonCode: "MISSING_ORG_OR_PHONE",
        scan: null,
        campaign: null
      };
    }

    const now = nowFn();
    const candidates = await repository.listPendingInboundScansForOrgPhone(orgId, phone);
    const eligible = [];

    for (const scan of candidates || []) {
      if (scan.status !== SCAN_STATUS.PENDING_INBOUND) continue;
      if (scan.consumed_at) continue;
      if (isExpired(scan, now)) continue;
      if (scan.org_id !== orgId) continue;
      if (scan.bound_phone_normalized !== phone) continue;

      const campaign = await repository.findCampaignById(scan.campaign_id);
      if (!campaign || campaign.org_id !== scan.org_id) {
        continue;
      }
      // Inactive campaign after trusted bind: still eligible for historical attribution.
      eligible.push({ scan, campaign });
    }

    if (eligible.length === 0) {
      emitQrEvent(EVENTS.ATTRIBUTION_MISSED, {
        organizationId: orgId,
        reasonCode: "NO_PENDING_SCAN",
        outcome: "no_pending_scan",
        phoneTail: phoneTail(phone)
      });
      return {
        ok: false,
        outcome: MATCH_OUTCOME.MISS,
        reasonCode: "NO_PENDING_SCAN",
        scan: null,
        campaign: null
      };
    }

    if (eligible.length > 1) {
      const ids = eligible.map((e) => e.scan.id);
      await repository.markScansAmbiguousConflict(ids);
      emitQrEvent(EVENTS.ATTRIBUTION_MISSED, {
        organizationId: orgId,
        reasonCode: "AMBIGUOUS_PENDING_SCANS",
        outcome: "ambiguous_pending_scans",
        phoneTail: phoneTail(phone)
      });
      return {
        ok: false,
        outcome: MATCH_OUTCOME.AMBIGUOUS,
        reasonCode: "AMBIGUOUS_PENDING_SCANS",
        scan: null,
        campaign: null,
        conflictingScanIds: ids
      };
    }

    const hit = eligible[0];
    return {
      ok: true,
      outcome: MATCH_OUTCOME.HIT,
      reasonCode: REASON_CODES.OK,
      scan: hit.scan,
      campaign: hit.campaign,
      historicalInactiveCampaign: hit.campaign.status !== CAMPAIGN_STATUS.ACTIVE
    };
  }

  /**
   * Consume a previously matched scan after prospect identity succeeded.
   * Idempotent if already consumed.
   */
  async function consumeMatchedScan({
    scanId,
    legacyProspectId = null,
    coreProspectId = null,
    inboundCorrelationId = null,
    inboundProviderMessageId = null,
    attributionResult = ATTRIBUTION_RESULT.ATTACHED_NEW,
    expectedOrgId = null
  }) {
    const existing = await repository.findScanById(scanId);
    if (!existing) {
      return { ok: false, reasonCode: REASON_CODES.SCAN_NOT_FOUND, scan: null };
    }

    if (expectedOrgId && existing.org_id !== expectedOrgId) {
      return { ok: false, reasonCode: REASON_CODES.ORG_MISMATCH, scan: existing };
    }

    if (existing.status === SCAN_STATUS.CONSUMED && existing.consumed_at) {
      emitQrEvent(EVENTS.SCAN_CONSUMED, {
        organizationId: existing.org_id,
        campaignId: existing.campaign_id,
        correlationId: existing.correlation_id,
        scanId: existing.id,
        outcome: "idempotent_replay"
      });
      return {
        ok: true,
        idempotent: true,
        reasonCode: REASON_CODES.OK,
        scan: existing,
        attributionResult: ATTRIBUTION_RESULT.IDEMPOTENT_REPLAY
      };
    }

    if (existing.status !== SCAN_STATUS.PENDING_INBOUND) {
      return {
        ok: false,
        reasonCode: REASON_CODES.SCAN_WRONG_STATUS,
        scan: existing
      };
    }

    const nowIso = nowFn().toISOString();
    const updated = await repository.updateScan(scanId, {
      status: SCAN_STATUS.CONSUMED,
      consumed_at: nowIso,
      legacy_prospect_id: legacyProspectId,
      core_prospect_id: coreProspectId,
      inbound_correlation_id: inboundCorrelationId,
      inbound_provider_message_id: inboundProviderMessageId,
      attribution_result: attributionResult
    });

    emitQrEvent(EVENTS.SCAN_CONSUMED, {
      organizationId: existing.org_id,
      campaignId: existing.campaign_id,
      correlationId: existing.correlation_id,
      scanId: existing.id,
      outcome: attributionResult
    });

    return {
      ok: true,
      idempotent: false,
      reasonCode: REASON_CODES.OK,
      scan: updated,
      attributionResult
    };
  }

  function buildAttributionTouch(campaign, scan, nowIso = nowFn().toISOString()) {
    return {
      campaignId: campaign.id,
      campaignKey: campaign.campaign_key,
      source: campaign.source,
      conversationGoal: campaign.default_conversation_goal || "interview",
      correlationId: scan.correlation_id,
      ownerUserId: campaign.owner_user_id,
      touchedAt: nowIso,
      historicalInactiveCampaign: campaign.status !== CAMPAIGN_STATUS.ACTIVE
    };
  }

  return {
    matchEligiblePendingInboundScan,
    consumeMatchedScan,
    buildAttributionTouch,
    mergeQrAttributionIntoLeadSource,
    resolveConversationGoal
  };
}

module.exports = {
  MATCH_OUTCOME,
  ATTRIBUTION_RESULT,
  createQrInboundAttributionService,
  mergeQrAttributionIntoLeadSource,
  resolveConversationGoal,
  isExpired
};
