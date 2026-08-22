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
const { evaluateRecruitingSessionActive } = require("./recruitingSessionGuard");

/** Durable proof that Atlas eligibility was earned from a verified event. */
const VERIFIED_ATLAS_ELIGIBILITY_SOURCES = Object.freeze({
  CTWA_REFERRAL: "CTWA_REFERRAL",
  QR: "QR",
  FACEBOOK_LEAD_ADS: "FACEBOOK_LEAD_ADS",
  QUICK_CAPTURE: "QUICK_CAPTURE"
});

const VERIFIED_SOURCE_SET = Object.freeze(
  new Set(Object.values(VERIFIED_ATLAS_ELIGIBILITY_SOURCES))
);

/** Stored origins that are only written by a verified intake path (not default CTWA). */
const VERIFIED_STORED_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.QR,
    WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
    "QUICK_CAPTURE"
  ])
);

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
  sourceFields = null
} = {}) {
  if (qrTouch || qrAttributed) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.QR;
  }
  if (hasPositiveCtwaReferral(ctwaReferral)) {
    return VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CTWA_REFERRAL;
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
  return null;
}

function hasFreshQrAttribution({ qrAttributed, qrTouch } = {}) {
  return Boolean(qrAttributed || qrTouch);
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

  const continuation = resolveContinuationProvenance({ prospect, workflowState });
  if (!continuation.proven) {
    return { eligible: false, reason: continuation.reason };
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
  persistVerifiedAtlasEligibilitySource,
  setAtlasAutomationEnabled,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
};
