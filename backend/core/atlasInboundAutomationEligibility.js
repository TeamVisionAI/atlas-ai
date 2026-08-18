/**
 * BR-142 — Atlas may auto-reply only when the sender is positively eligible.
 * Shared 7338 is both Cloud API and a personal/business number; unknown inbound
 * must stay silent. Do not infer eligibility from greeting text.
 */

const { MILESTONES } = require("./workflowConstants");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("./whatsappConstants");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("./workflowStateStore");

const ELIGIBLE_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    WHATSAPP_ENTRY_METHOD.QR,
    WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
    "QUICK_CAPTURE"
  ])
);

const ELIGIBLE_SOURCES = Object.freeze(
  new Set([
    String(WHATSAPP_SOURCE.FACEBOOK).toUpperCase(),
    String(WHATSAPP_SOURCE.CAR_MAGNET).toUpperCase()
  ])
);

const ACTIVE_AUTOMATION_STEPS = Object.freeze(
  new Set([
    "QUALIFYING",
    "QUALIFICATION",
    "GREETING_SENT",
    "SCHEDULE",
    "SCHEDULING",
    "INTERVIEW_READY",
    "INTERVIEW_SCHEDULED",
    "INTERVIEW_DUE",
    "INTERVIEW_COMPLETED",
    "INTERVIEW_RESULT_PENDING",
    "FOLLOW_UP",
    "ORIENTATION",
    "LICENSING",
    "FAST_START"
  ])
);

const ACTIVE_AUTOMATION_MILESTONES = Object.freeze(
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

function hasEligibleStoredOrigin(prospect) {
  const entry = upper(prospect?.entry_method);
  const source = upper(prospect?.source);
  if (ELIGIBLE_ENTRY_METHODS.has(entry) || ELIGIBLE_ENTRY_METHODS.has(prospect?.entry_method)) {
    return true;
  }
  return ELIGIBLE_SOURCES.has(source);
}

function isInActiveAutomatedWorkflow(prospect, workflowState) {
  const step = upper(prospect?.current_step);
  if (ACTIVE_AUTOMATION_STEPS.has(step)) {
    return true;
  }
  const milestone = upper(
    workflowState?.canonicalMilestone || prospect?.canonicalMilestone
  );
  return ACTIVE_AUTOMATION_MILESTONES.has(milestone);
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

  if (hasQrOrigin({ prospect, qrAttributed, qrTouch })) {
    return { eligible: true, reason: "QR_ATTRIBUTION" };
  }

  if (hasEligibleStoredOrigin(prospect)) {
    return { eligible: true, reason: "ELIGIBLE_ORIGIN" };
  }

  if (isInActiveAutomatedWorkflow(prospect, workflowState)) {
    return { eligible: true, reason: "ACTIVE_AUTOMATED_WORKFLOW" };
  }

  return { eligible: false, reason: "NOT_ELIGIBLE" };
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
  setAtlasAutomationEnabled,
  ELIGIBLE_ENTRY_METHODS,
  ACTIVE_AUTOMATION_STEPS
};
