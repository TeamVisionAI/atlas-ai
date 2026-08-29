/**
 * BR-142 — Atlas may auto-reply only when the sender is positively eligible.
 * Shared 7338 is both Cloud API and a personal/business number; unknown inbound
 * must stay silent. Do not infer eligibility from greeting text, FACEBOOK /
 * CLICK_TO_WHATSAPP labels, or an existing Recruit AI session.
 */

const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("./whatsappConstants");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("./workflowStateStore");
const {
  evaluateRecruitingSessionActive,
  resolveLastRecruitingActivityMs
} = require("./recruitingSessionGuard");
const { REOPENED_INACTIVITY_MS } = require("./whatsappConstants");
const { isIulWorkflowProspect } = require("./iulWorkflowConstants");
const { INTAKE_CODE_STATUS } = require("./campaignIntakeCode/constants");

/** Durable proof that Atlas eligibility was earned from a verified event. */
const VERIFIED_ATLAS_ELIGIBILITY_SOURCES = Object.freeze({
  CTWA_REFERRAL: "CTWA_REFERRAL",
  QR: "QR",
  FACEBOOK_LEAD_ADS: "FACEBOOK_LEAD_ADS",
  QUICK_CAPTURE: "QUICK_CAPTURE",
  CAMPAIGN_INTAKE_CODE: "CAMPAIGN_INTAKE_CODE",
  /** BR-147 — validated ACTIVE IUL campaign intake (policy_review lane only). */
  CAMPAIGN_INTAKE_IUL: "CAMPAIGN_INTAKE_IUL",
  /** Historical BR-165 marker only. Personal connection is NOT verified eligibility. */
  PERSONAL_WHATSAPP: "PERSONAL_WHATSAPP"
});

const VERIFIED_SOURCE_SET = Object.freeze(
  new Set(
    Object.values(VERIFIED_ATLAS_ELIGIBILITY_SOURCES).filter(
      (source) => source !== VERIFIED_ATLAS_ELIGIBILITY_SOURCES.PERSONAL_WHATSAPP
    )
  )
);

/** Stored origins that are only written by a verified intake path (not default CTWA). */
const VERIFIED_STORED_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.QR,
    WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
    WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    "QUICK_CAPTURE"
  ])
);

function isPersonalWhatsAppConnection(source) {
  return String(source || "").trim() === "whatsapp_personal_connection";
}

function isPersonalWhatsAppOriginMarker(prospect = {}, workflowState = {}) {
  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};
  return (
    upper(wf.atlasEligibilitySource) === VERIFIED_ATLAS_ELIGIBILITY_SOURCES.PERSONAL_WHATSAPP ||
    upper(prospect?.entry_method) === WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP ||
    upper(prospect?.source) === WHATSAPP_SOURCE.PERSONAL_WHATSAPP
  );
}

function hasAtlasBusinessEligibilityEvidence(prospect = {}, workflowState = {}) {
  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};
  if (wf.atlasAutomationEnabled === true) {
    return true;
  }
  if (VERIFIED_SOURCE_SET.has(upper(wf.atlasEligibilitySource))) {
    return true;
  }
  if (hasQrOrigin({ prospect })) {
    return true;
  }
  const entry = upper(prospect?.entry_method);
  return (
    entry === WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP ||
    hasVerifiedStoredIntakeOrigin(prospect)
  );
}

/** Personal connection / historical PERSONAL_WHATSAPP marker without a real Atlas origin. */
function isOrdinaryPersonalWhatsAppContact(prospect = {}, workflowState = {}) {
  if (!prospect || !isPersonalWhatsAppOriginMarker(prospect, workflowState)) {
    return false;
  }
  return !hasAtlasBusinessEligibilityEvidence(prospect, workflowState);
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

/**
 * Positive Meta Click-to-WhatsApp ad evidence (webhook `message.referral`).
 * `source_type=ad` or `ctwa_clid` — never greetings or contact name.
 */
function hasPositiveCtwaReferral(referral) {
  if (!referral || typeof referral !== "object") {
    return false;
  }
  const sourceType = String(
    referral.sourceType || referral.source_type || ""
  )
    .trim()
    .toLowerCase();
  if (sourceType === "ad") {
    return true;
  }
  return Boolean(referral.ctwaClid || referral.ctwa_clid);
}

function hasQrOrigin({ prospect, qrAttributed, qrTouch } = {}) {
  if (qrAttributed || qrTouch) {
    return true;
  }
  const entry = upper(prospect?.entry_method);
  const source = upper(prospect?.source);
  return (
    entry === WHATSAPP_ENTRY_METHOD.QR ||
    source === upper(WHATSAPP_SOURCE.CAR_MAGNET)
  );
}

function hasVerifiedStoredIntakeOrigin(prospect) {
  const entry = upper(prospect?.entry_method);
  return VERIFIED_STORED_ENTRY_METHODS.has(entry);
}

function resolveVerifiedAtlasEligibilitySource({
  qrTouch = null,
  qrAttributed = false,
  ctwaReferral = null,
  intakeSource = null,
  sourceFields = null,
  campaignIntakeMatch = null,
  whatsappConnectionSource = null
} = {}) {
  if (qrTouch || qrAttributed) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.QR;
  }
  if (hasPositiveCtwaReferral(ctwaReferral)) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CTWA_REFERRAL;
  }
  if (
    campaignIntakeMatch?.matched === true &&
    String(campaignIntakeMatch.purpose || "").toUpperCase() === "RECRUITING" &&
    campaignIntakeMatch.recruitingEligible === true
  ) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_CODE;
  }
  if (hasFreshIulCampaignIntakeMatch({ campaignIntakeMatch })) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL;
  }
  const entry = upper(sourceFields?.entryMethod || intakeSource);
  if (entry === WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS || entry === "FACEBOOK_LEAD") {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.FACEBOOK_LEAD_ADS;
  }
  if (entry === "QUICK_CAPTURE") {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.QUICK_CAPTURE;
  }
  if (upper(sourceFields?.source) === upper(WHATSAPP_SOURCE.CAR_MAGNET)) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.QR;
  }

  // BR-165A — a personal WhatsApp connection establishes owner/routing only.
  // It must never be persisted as positive Atlas automation eligibility.
  if (
    isPersonalWhatsAppConnection(whatsappConnectionSource) ||
    entry === WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP ||
    upper(sourceFields?.source) === "PERSONAL_WHATSAPP"
  ) {
    return null;
  }
  return null;
}

function hasFreshQrAttribution({ qrAttributed, qrTouch } = {}) {
  return Boolean(qrAttributed || qrTouch);
}

/**
 * Positive Atlas campaign intake code on this inbound (BR-147).
 * Only RECRUITING purpose may authorize Recruit AI auto-reply.
 */
function hasFreshRecruitingCampaignIntakeMatch(inbound) {
  const match = inbound?.campaignIntakeMatch;
  return Boolean(
    match?.matched === true &&
      String(match.purpose || "").toUpperCase() === "RECRUITING" &&
      match.recruitingEligible === true
  );
}

/**
 * Positive ACTIVE IUL campaign intake on this inbound (BR-147).
 * Policy-review lane only — never Recruit AI recruiting qualification.
 */
function hasFreshIulCampaignIntakeMatch(inbound) {
  const match = inbound?.campaignIntakeMatch;
  return Boolean(
    match?.matched === true &&
      String(match.purpose || "").toUpperCase() === "IUL" &&
      upper(match.status) === INTAKE_CODE_STATUS.ACTIVE &&
      match.iulReviewEligible === true &&
      match.recruitingEligible !== true
  );
}

function evaluateIulReviewSessionActive({
  prospect = null,
  workflowState = null,
  now = Date.now()
} = {}) {
  if (!prospect) {
    return { active: false, reason: "MISSING_PROSPECT" };
  }

  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};
  if (!isIulWorkflowProspect(wf, {})) {
    return { active: false, reason: "IUL_SESSION_INACTIVE" };
  }

  if (wf.inboxClosedAt || wf.inboxArchivedAt) {
    return { active: false, reason: "CONVERSATION_CLOSED_OR_ARCHIVED" };
  }
  if (wf.manualAgentOwnership === true || Boolean(wf.humanTakenOverAt)) {
    return { active: false, reason: "HUMAN_OWNED" };
  }

  const lastActivityMs = resolveLastRecruitingActivityMs(prospect, wf);
  if (
    lastActivityMs != null &&
    now - lastActivityMs > REOPENED_INACTIVITY_MS
  ) {
    return { active: false, reason: "IUL_SESSION_EXPIRED" };
  }

  return { active: true, reason: "ACTIVE_IUL_REVIEW_WORKFLOW" };
}

function hasStoredQrOrigin(prospect) {
  const entry = upper(prospect?.entry_method);
  const source = upper(prospect?.source);
  return (
    entry === WHATSAPP_ENTRY_METHOD.QR ||
    source === upper(WHATSAPP_SOURCE.CAR_MAGNET)
  );
}

function resolveContinuationProvenance({ prospect, workflowState } = {}) {
  const storedProof = upper(workflowState?.atlasEligibilitySource);
  if (VERIFIED_SOURCE_SET.has(storedProof)) {
    return { proven: true, reason: "VERIFIED_ELIGIBILITY_SOURCE" };
  }

  if (hasVerifiedStoredIntakeOrigin(prospect)) {
    return { proven: true, reason: "VERIFIED_STORED_ORIGIN" };
  }

  if (hasStoredQrOrigin(prospect)) {
    return { proven: true, reason: "QR_STORED_ORIGIN" };
  }

  return { proven: false, reason: "NOT_ELIGIBLE" };
}

/**
 * @returns {{ eligible: boolean, reason: string }}
 */
function evaluateAtlasInboundAutomationEligibility({
  prospect = null,
  inbound = null,
  qrAttributed = false,
  qrTouch = null,
  workflowState = null
} = {}) {
  if (!prospect) {
    return { eligible: false, reason: "MISSING_PROSPECT" };
  }

  if (workflowState?.atlasAutomationEnabled === false) {
    return { eligible: false, reason: "EXPLICITLY_DISABLED" };
  }

  if (workflowState?.atlasAutomationEnabled === true) {
    return { eligible: true, reason: "EXPLICITLY_ENABLED" };
  }

  const referral = inbound?.ctwaReferral || inbound?.referral || null;
  if (hasPositiveCtwaReferral(referral)) {
    return { eligible: true, reason: "CTWA_REFERRAL" };
  }

  if (hasFreshQrAttribution({ qrAttributed, qrTouch })) {
    return { eligible: true, reason: "QR_ATTRIBUTION" };
  }

  if (hasFreshRecruitingCampaignIntakeMatch(inbound)) {
    return { eligible: true, reason: "CAMPAIGN_INTAKE_CODE" };
  }

  if (hasFreshIulCampaignIntakeMatch(inbound)) {
    return { eligible: true, reason: "CAMPAIGN_INTAKE_IUL" };
  }

  // BR-165A — personal connection alone is not consent/eligibility.
  // Legitimate personal-number leads continue below only if they previously earned
  // a verified CTWA/QR/intake source or automation was explicitly enabled.
  const continuation = resolveContinuationProvenance({ prospect, workflowState });
  if (!continuation.proven) {
    return { eligible: false, reason: continuation.reason };
  }

  if (
    upper(workflowState?.atlasEligibilitySource) ===
    VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL
  ) {
    const iulSession = evaluateIulReviewSessionActive({ prospect, workflowState });
    if (!iulSession.active) {
      return { eligible: false, reason: iulSession.reason };
    }
    return { eligible: true, reason: continuation.reason };
  }

  const session = evaluateRecruitingSessionActive({ prospect, workflowState });
  if (!session.active) {
    return { eligible: false, reason: session.reason };
  }

  return { eligible: true, reason: continuation.reason };
}

async function resolveAtlasInboundAutomationEligibility(input = {}) {
  const prospect = input.prospect || null;
  let workflowState = input.workflowState || null;

  if (!workflowState && prospect?.phone) {
    try {
      workflowState = await loadPersistedWorkflowState(prospect.phone, {
        organizationId: prospect.organization_id || prospect.organizationId || null,
        prospectId: prospect.id || null
      });
    } catch {
      workflowState = null;
    }
  }

  return evaluateAtlasInboundAutomationEligibility({
    ...input,
    prospect,
    workflowState
  });
}

async function persistVerifiedAtlasEligibilitySource(phone, source, options = {}) {
  const eligibilitySource = upper(source);
  if (!phone || !VERIFIED_SOURCE_SET.has(eligibilitySource)) {
    return null;
  }
  return savePersistedWorkflowState(
    phone,
    { atlasEligibilitySource: eligibilitySource },
    options
  );
}

async function setAtlasAutomationEnabled(phone, enabled, options = {}) {
  return savePersistedWorkflowState(
    phone,
    { atlasAutomationEnabled: enabled === true },
    options
  );
}

module.exports = {
  evaluateAtlasInboundAutomationEligibility,
  resolveAtlasInboundAutomationEligibility,
  hasPositiveCtwaReferral,
  hasQrOrigin,
  hasFreshQrAttribution,
  hasStoredQrOrigin,
  resolveContinuationProvenance,
  resolveVerifiedAtlasEligibilitySource,
  hasFreshRecruitingCampaignIntakeMatch,
  hasFreshIulCampaignIntakeMatch,
  evaluateIulReviewSessionActive,
  persistVerifiedAtlasEligibilitySource,
  setAtlasAutomationEnabled,
  isPersonalWhatsAppConnection,
  isPersonalWhatsAppOriginMarker,
  hasAtlasBusinessEligibilityEvidence,
  isOrdinaryPersonalWhatsAppContact,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES,
  VERIFIED_SOURCE_SET
};
