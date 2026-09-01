/**
 * BR-200 — eligibility gate before any automated WhatsApp outbound.
 * HUMAN / AGENT sends are not gated. Connection-only BR-193 fallback is not
 * outbound proof. FACEBOOK / CLICK_TO_WHATSAPP labels are not proof.
 */

const {
  evaluatePositiveAtlasLeadProvenance,
  hasPositiveCtwaReferral,
  hasFreshRecruitingCampaignIntakeMatch,
  hasFreshIulCampaignIntakeMatch,
  isOrdinaryPersonalWhatsAppContact,
  isPersonalWhatsAppOriginMarker,
  hasRealStoredCtwaEvidence,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("./atlasInboundAutomationEligibility");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("./whatsappConstants");

const OUTBOUND_REASONS = Object.freeze({
  MANUAL_HUMAN_OR_AGENT: "MANUAL_HUMAN_OR_AGENT",
  EXPLICITLY_ENABLED: "EXPLICITLY_ENABLED",
  CTWA_REFERRAL: "CTWA_REFERRAL",
  QR_ATTRIBUTION: "QR_ATTRIBUTION",
  CAMPAIGN_INTAKE: "CAMPAIGN_INTAKE",
  CAMPAIGN_INTAKE_IUL: "CAMPAIGN_INTAKE_IUL",
  VERIFIED_ELIGIBILITY_SOURCE: "VERIFIED_ELIGIBILITY_SOURCE",
  FACEBOOK_LEAD_ADS: "FACEBOOK_LEAD_ADS",
  EXPLICIT_PROSPECT_CREATE: "EXPLICIT_PROSPECT_CREATE",
  IUL_CAMPAIGN_WORKFLOW: "IUL_CAMPAIGN_WORKFLOW",
  NO_POSITIVE_PROVENANCE: "NO_POSITIVE_PROVENANCE",
  PERSONAL_WHATSAPP_NO_LEAD: "PERSONAL_WHATSAPP_NO_LEAD",
  LEGACY_AMBIGUOUS: "LEGACY_AMBIGUOUS",
  INVALID_CTWA_EVIDENCE: "INVALID_CTWA_EVIDENCE",
  UNSUPPORTED_PROVENANCE: "UNSUPPORTED_PROVENANCE",
  MISSING_PROSPECT: "MISSING_PROSPECT"
});

const MANUAL_ACTORS = Object.freeze(new Set(["HUMAN", "AGENT"]));

const AMBIGUOUS_LABELS = Object.freeze(
  new Set(["FACEBOOK", "CLICK_TO_WHATSAPP", "PERSONAL_WHATSAPP"])
);

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function isManualOutboundActor(actor) {
  return MANUAL_ACTORS.has(upper(actor));
}

function resolveWorkflowState(prospect = {}, workflowState = null) {
  if (workflowState && typeof workflowState === "object" && !Array.isArray(workflowState)) {
    return workflowState;
  }
  const raw = prospect?.workflow_state;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

function classifyInboundType(inboundEvent = {}) {
  const raw = String(
    inboundEvent.messageType || inboundEvent.mediaType || inboundEvent.type || ""
  )
    .trim()
    .toLowerCase();
  if (["image", "document", "audio", "video", "sticker", "text"].includes(raw)) {
    return raw;
  }
  const text = String(inboundEvent.text || inboundEvent.body || "");
  const placeholder = text.match(/^\[([a-z0-9_]+) message\]$/i);
  if (placeholder) {
    return String(placeholder[1] || "").toLowerCase();
  }
  return raw || (text ? "text" : "unknown");
}

function hasFreshInboundProof(inboundEvent = {}, qrAttributed = false) {
  const referral = inboundEvent.ctwaReferral || inboundEvent.referral || null;
  if (hasPositiveCtwaReferral(referral)) {
    return { eligible: true, reason: OUTBOUND_REASONS.CTWA_REFERRAL, evidence: "inbound_ctwa" };
  }
  if (referral && typeof referral === "object") {
    const sourceType = String(referral.source_type || referral.sourceType || "").toLowerCase();
    if (sourceType && sourceType !== "ad") {
      return {
        eligible: false,
        reason: OUTBOUND_REASONS.INVALID_CTWA_EVIDENCE,
        evidence: "inbound_referral_not_ad"
      };
    }
  }
  if (qrAttributed === true || inboundEvent.qrAttributed === true || inboundEvent.qrTouch) {
    return { eligible: true, reason: OUTBOUND_REASONS.QR_ATTRIBUTION, evidence: "inbound_qr" };
  }
  if (hasFreshRecruitingCampaignIntakeMatch(inboundEvent)) {
    return {
      eligible: true,
      reason: OUTBOUND_REASONS.CAMPAIGN_INTAKE,
      evidence: "inbound_campaign"
    };
  }
  if (hasFreshIulCampaignIntakeMatch(inboundEvent)) {
    return {
      eligible: true,
      reason: OUTBOUND_REASONS.CAMPAIGN_INTAKE_IUL,
      evidence: "inbound_iul_campaign"
    };
  }
  return null;
}

function hasAmbiguousLabelOnly(prospect = {}, workflowState = {}) {
  const labels = [
    prospect.source,
    prospect.entry_method,
    workflowState.atlasEligibilitySource
  ].map(upper);
  return labels.some((label) => AMBIGUOUS_LABELS.has(label));
}

function isMetaAdDestinationOnly(prospect = {}, workflowState = {}, stored = {}) {
  const source = upper(workflowState.atlasEligibilitySource);
  const entry = upper(prospect.entry_method);
  const rowSource = upper(prospect.source);
  const metaOnly =
    source === VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION ||
    entry === WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION ||
    rowSource === upper(WHATSAPP_SOURCE.META_AD_DESTINATION) ||
    stored.reason === "META_AD_DESTINATION";
  if (!metaOnly) {
    return false;
  }
  if (hasRealStoredCtwaEvidence(prospect, workflowState)) {
    return false;
  }
  return true;
}

/**
 * @returns {{
 *   eligible: boolean,
 *   reason: string,
 *   evidence: string|null,
 *   failClosed: boolean,
 *   inboundType: string,
 *   source: string|null
 * }}
 */
function evaluateAutomationOutboundEligibility({
  organizationId = null,
  connection = null,
  prospect = null,
  inboundEvent = null,
  provenance = null,
  source = null,
  workflowState = null,
  actor = "ATLAS",
  qrAttributed = false
} = {}) {
  void organizationId;
  void connection;

  const inboundType = classifyInboundType(inboundEvent || {});
  if (isManualOutboundActor(actor)) {
    return {
      eligible: true,
      reason: OUTBOUND_REASONS.MANUAL_HUMAN_OR_AGENT,
      evidence: "actor",
      failClosed: false,
      inboundType,
      source: source || "manual"
    };
  }

  if (!prospect) {
    return {
      eligible: false,
      reason: OUTBOUND_REASONS.MISSING_PROSPECT,
      evidence: null,
      failClosed: true,
      inboundType,
      source: source || null
    };
  }

  const wf = resolveWorkflowState(prospect, workflowState);
  if (wf.atlasAutomationEnabled === false) {
    return {
      eligible: false,
      reason: OUTBOUND_REASONS.NO_POSITIVE_PROVENANCE,
      evidence: "explicitly_disabled",
      failClosed: true,
      inboundType,
      source: source || "explicit_disable"
    };
  }

  if (wf.atlasAutomationEnabled === true) {
    return {
      eligible: true,
      reason: OUTBOUND_REASONS.EXPLICITLY_ENABLED,
      evidence: "atlasAutomationEnabled",
      failClosed: false,
      inboundType,
      source: source || "explicit_enable"
    };
  }

  const fresh = hasFreshInboundProof(inboundEvent || {}, qrAttributed);
  if (fresh) {
    return {
      ...fresh,
      failClosed: !fresh.eligible,
      inboundType,
      source: source || fresh.evidence
    };
  }

  const stored = provenance || evaluatePositiveAtlasLeadProvenance(prospect, wf);
  const metaOnly = isMetaAdDestinationOnly(prospect, wf, stored);
  if (stored.eligible && !metaOnly) {
    return {
      eligible: true,
      reason: stored.reason,
      evidence: stored.reason,
      failClosed: false,
      inboundType,
      source: source || "stored_provenance"
    };
  }

  if (
    isOrdinaryPersonalWhatsAppContact(prospect, wf) ||
    isPersonalWhatsAppOriginMarker(prospect, wf)
  ) {
    return {
      eligible: false,
      reason: OUTBOUND_REASONS.PERSONAL_WHATSAPP_NO_LEAD,
      evidence: "personal_origin_without_lead_proof",
      failClosed: true,
      inboundType,
      source: source || "personal_whatsapp"
    };
  }

  if (metaOnly) {
    return {
      eligible: false,
      reason: OUTBOUND_REASONS.LEGACY_AMBIGUOUS,
      evidence: stored.reason || "META_AD_DESTINATION",
      failClosed: true,
      inboundType,
      source: source || "meta_ad_destination_only"
    };
  }

  if (hasAmbiguousLabelOnly(prospect, wf)) {
    return {
      eligible: false,
      reason: OUTBOUND_REASONS.LEGACY_AMBIGUOUS,
      evidence: "facebook_or_ctwa_label_only",
      failClosed: true,
      inboundType,
      source: source || "ambiguous_label"
    };
  }

  return {
    eligible: false,
    reason: OUTBOUND_REASONS.NO_POSITIVE_PROVENANCE,
    evidence: stored.reason || "NO_POSITIVE_LEAD_PROVENANCE",
    failClosed: true,
    inboundType,
    source: source || "fail_closed"
  };
}

function emitAutomatedOutboundSuppression({
  eligibility = {},
  prospect = null,
  inboundEvent = null,
  handlerPath = null,
  attemptedSend = false
} = {}) {
  const { logWhatsAppStage } = require("./whatsappStructuredLogger");
  logWhatsAppStage("automated_outbound_suppressed_not_eligible", {
    organizationId: prospect?.organization_id || prospect?.organizationId || null,
    ownerUserId: prospect?.owner_user_id || prospect?.ownerUserId || null,
    prospectId: prospect?.id || null,
    inboundType: eligibility.inboundType || classifyInboundType(inboundEvent || {}),
    provenanceResult: eligibility.evidence || null,
    suppressionReason: eligibility.reason || OUTBOUND_REASONS.NO_POSITIVE_PROVENANCE,
    handlerPath: handlerPath || eligibility.source || null,
    failClosed: eligibility.failClosed !== false,
    attemptedSend: attemptedSend === true
  });

  if (attemptedSend !== true) {
    return;
  }

  try {
    const { SIGNAL_TYPES, SEVERITIES, SOURCE_ENGINES } = require("./aiQuality/constants");
    logWhatsAppStage("ai_quality_automated_outbound_eligibility_bypass", {
      organizationId: prospect?.organization_id || prospect?.organizationId || null,
      ownerUserId: prospect?.owner_user_id || prospect?.ownerUserId || null,
      prospectId: prospect?.id || null,
      signalType: SIGNAL_TYPES.AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS,
      severity: SEVERITIES.HIGH,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2,
      inboundType: eligibility.inboundType || classifyInboundType(inboundEvent || {}),
      suppressionReason: eligibility.reason || null,
      handlerPath: handlerPath || null
    });
  } catch {
    // Observability must never affect send suppression.
  }
}

module.exports = {
  OUTBOUND_REASONS,
  evaluateAutomationOutboundEligibility,
  isManualOutboundActor,
  classifyInboundType,
  emitAutomatedOutboundSuppression
};
