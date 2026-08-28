/**
 * BR-159 — A contact becomes an operational prospect only after a valid
 * promotion signal. Shared for every tenant; no organization UUID branching.
 * Reuses BR-142 fail-closed origins. Does not weaken CTWA / QR / IUL / recruiting.
 */

const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("./whatsappConstants");
const {
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES,
  hasPositiveCtwaReferral,
  hasFreshRecruitingCampaignIntakeMatch,
  hasFreshIulCampaignIntakeMatch,
  isPersonalWhatsAppConnection
} = require("./atlasInboundAutomationEligibility");
const { MILESTONES } = require("./workflowConstants");
const { isIulWorkflowProspect } = require("./iulWorkflowConstants");

const VERIFIED_SOURCE_SET = Object.freeze(
  new Set(Object.values(VERIFIED_ATLAS_ELIGIBILITY_SOURCES))
);

/** Stored origins written only by a verified create/convert path. */
const VERIFIED_PROMOTION_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.QR,
    WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
    WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    "QUICK_CAPTURE",
    "MANUAL_CONVERT",
    "MANUAL_CREATE"
  ])
);

const GENUINE_PROGRESS_STEPS = Object.freeze(
  new Set([
    "QUALIFICATION",
    "QUALIFIED",
    "CONFIRMED",
    MILESTONES.QUALIFICATION,
    MILESTONES.INTERVIEW_READY,
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.INTERVIEW_DUE,
    MILESTONES.INTERVIEW_COMPLETED,
    MILESTONES.INTERVIEW_RESULT_PENDING,
    MILESTONES.FOLLOW_UP,
    MILESTONES.ORIENTATION,
    MILESTONES.LICENSING,
    MILESTONES.FAST_START
  ])
);

const GENUINE_PROGRESS_MILESTONES = Object.freeze(
  new Set([
    MILESTONES.GREETING_SENT,
    MILESTONES.QUALIFICATION,
    MILESTONES.INTERVIEW_READY,
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.INTERVIEW_DUE,
    MILESTONES.INTERVIEW_COMPLETED,
    MILESTONES.INTERVIEW_RESULT_PENDING,
    MILESTONES.FOLLOW_UP,
    MILESTONES.ORIENTATION,
    MILESTONES.LICENSING,
    MILESTONES.FAST_START
  ])
);

function upper(value) {
  return String(value || "").trim().toUpperCase();
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

function resolvePromotionRecord(prospect = {}, workflowState = null) {
  const wf = resolveWorkflowState(prospect, workflowState);
  if (wf.prospectPromotion && typeof wf.prospectPromotion === "object") {
    return wf.prospectPromotion;
  }
  const meta = prospect?.metadata;
  if (meta && typeof meta === "object" && meta.prospectPromotion) {
    return meta.prospectPromotion;
  }
  return null;
}

function hasQrStoredOrigin(prospect = {}) {
  const entry = upper(prospect.entry_method);
  const source = upper(prospect.source);
  return (
    entry === WHATSAPP_ENTRY_METHOD.QR ||
    source === upper(WHATSAPP_SOURCE.CAR_MAGNET)
  );
}

function hasVerifiedStoredPromotionOrigin(prospect = {}) {
  const entry = upper(prospect.entry_method);
  const source = upper(prospect.source);
  if (VERIFIED_PROMOTION_ENTRY_METHODS.has(entry)) {
    return true;
  }
  return source === upper(WHATSAPP_SOURCE.CAMPAIGN_INTAKE);
}

function hasVerifiedEligibilitySource(workflowState = {}) {
  return VERIFIED_SOURCE_SET.has(upper(workflowState.atlasEligibilitySource));
}

function hasGenuineLifecycleEvidence(prospect = {}, workflowState = {}) {
  if (isIulWorkflowProspect(workflowState, {})) {
    return true;
  }
  const milestone = upper(workflowState.canonicalMilestone);
  if (GENUINE_PROGRESS_MILESTONES.has(milestone)) {
    return true;
  }
  const step = upper(prospect.current_step || prospect.status);
  if (GENUINE_PROGRESS_STEPS.has(step)) {
    return true;
  }
  if (prospect.interview_date || prospect.appointment_id) {
    return true;
  }
  return false;
}

function hasFreshFacebookLeadAdsOrigin({ intakeSource, sourceFields } = {}) {
  const entry = upper(sourceFields?.entryMethod || intakeSource);
  return (
    entry === WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS ||
    entry === "FACEBOOK_LEAD" ||
    entry === "FACEBOOK_LEAD_ADS"
  );
}

function hasFreshQuickCaptureOrigin({ intakeSource, sourceFields, explicitPromote } = {}) {
  const entry = upper(sourceFields?.entryMethod || intakeSource);
  return (
    explicitPromote === true ||
    entry === "QUICK_CAPTURE" ||
    entry === "MANUAL_CONVERT" ||
    entry === "MANUAL_CREATE"
  );
}

/**
 * Create-time gate: should this inbound/contact become a prospects row?
 * Existing rows are located, not re-created.
 *
 * @returns {{ promote: boolean, reason: string }}
 */
function evaluateProspectPromotion({
  existingProspect = null,
  qrTouch = null,
  qrAttributed = false,
  ctwaReferral = null,
  campaignIntakeMatch = null,
  intakeSource = null,
  sourceFields = null,
  explicitPromote = false,
  atlasAutomationEnabled = null,
  whatsappConnectionSource = null
} = {}) {
  if (existingProspect) {
    return { promote: true, reason: "EXISTING_PROSPECT" };
  }

  if (atlasAutomationEnabled === true) {
    return { promote: true, reason: "EXPLICITLY_ENABLED" };
  }

  if (qrTouch || qrAttributed) {
    return { promote: true, reason: "QR_ATTRIBUTION" };
  }

  if (hasPositiveCtwaReferral(ctwaReferral)) {
    return { promote: true, reason: "CTWA_REFERRAL" };
  }

  if (
    hasFreshRecruitingCampaignIntakeMatch({
      campaignIntakeMatch
    })
  ) {
    return { promote: true, reason: "CAMPAIGN_INTAKE_CODE" };
  }

  if (hasFreshIulCampaignIntakeMatch({ campaignIntakeMatch })) {
    return { promote: true, reason: "CAMPAIGN_INTAKE_IUL" };
  }

  if (hasFreshFacebookLeadAdsOrigin({ intakeSource, sourceFields })) {
    return { promote: true, reason: "FACEBOOK_LEAD_ADS" };
  }

  if (hasFreshQuickCaptureOrigin({ intakeSource, sourceFields, explicitPromote })) {
    return { promote: true, reason: "EXPLICIT_PROSPECT_CREATE" };
  }

  // Implements BR-165 — user-owned WhatsApp inbound is a promotion signal.
  // Shared org numbers stay fail-closed (BR-142 / BR-159).
  if (
    isPersonalWhatsAppConnection(whatsappConnectionSource) ||
    upper(sourceFields?.entryMethod) === WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP
  ) {
    return { promote: true, reason: "PERSONAL_WHATSAPP" };
  }

  return { promote: false, reason: "NO_VALID_PROMOTION_SIGNAL" };
}

function shouldPromoteContactToProspect(input = {}) {
  return evaluateProspectPromotion(input).promote;
}

/**
 * Operational-list membership for Dashboard / Mission Control / Prospect Center / KPIs.
 * Conversations archive may still load non-operational contact rows separately.
 */
function evaluateOperationalProspectRecord(prospect = null, workflowState = null) {
  if (!prospect) {
    return { operational: false, reason: "MISSING_PROSPECT" };
  }

  const wf = resolveWorkflowState(prospect, workflowState);
  const promotion = resolvePromotionRecord(prospect, wf);

  if (promotion?.operational === false) {
    return { operational: false, reason: "EXPLICITLY_DEPROMOTED" };
  }

  if (wf.atlasAutomationEnabled === true || promotion?.operational === true) {
    return { operational: true, reason: "EXPLICITLY_ENABLED" };
  }

  if (hasVerifiedEligibilitySource(wf)) {
    return { operational: true, reason: "VERIFIED_ELIGIBILITY_SOURCE" };
  }

  if (hasQrStoredOrigin(prospect) || hasVerifiedStoredPromotionOrigin(prospect)) {
    return { operational: true, reason: "VERIFIED_STORED_ORIGIN" };
  }

  if (hasGenuineLifecycleEvidence(prospect, wf)) {
    return { operational: true, reason: "GENUINE_LIFECYCLE_EVIDENCE" };
  }

  return { operational: false, reason: "NO_VALID_PROMOTION_SIGNAL" };
}

function isOperationalProspectRecord(prospect, workflowState = null) {
  return evaluateOperationalProspectRecord(prospect, workflowState).operational;
}

function filterOperationalProspects(prospects = [], workflowByPhone = null) {
  return (prospects || []).filter((prospect) => {
    const wf =
      (workflowByPhone && prospect?.phone && workflowByPhone[prospect.phone]) ||
      null;
    return isOperationalProspectRecord(prospect, wf);
  });
}

function buildDepromotionPatch({ reason = "NO_VALID_PROMOTION_SIGNAL", at = null } = {}) {
  return {
    prospectPromotion: {
      operational: false,
      reason,
      rule: "BR-159",
      depromotedAt: at || new Date().toISOString()
    }
  };
}

module.exports = {
  evaluateProspectPromotion,
  shouldPromoteContactToProspect,
  evaluateOperationalProspectRecord,
  isOperationalProspectRecord,
  filterOperationalProspects,
  hasQrStoredOrigin,
  hasVerifiedStoredPromotionOrigin,
  buildDepromotionPatch,
  VERIFIED_PROMOTION_ENTRY_METHODS
};
