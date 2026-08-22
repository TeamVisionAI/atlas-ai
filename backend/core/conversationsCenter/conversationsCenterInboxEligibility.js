/**
 * Conversations Center recruiting inbox eligibility (presentation only).
 * Durable positive recruiting origin — separate from BR-142 auto-reply session gates.
 * Implements inbox membership for Active / Atlas / Human / Needs Attention tabs.
 */

const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../whatsappConstants");
const { loadPersistedWorkflowState } = require("../workflowStateStore");
const {
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../atlasInboundAutomationEligibility");

const VERIFIED_SOURCE_SET = Object.freeze(
  new Set(Object.values(VERIFIED_ATLAS_ELIGIBILITY_SOURCES))
);

const VERIFIED_STORED_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.QR,
    // Written only when webhook carried positive CTWA referral at create (BR-142).
    WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
    "QUICK_CAPTURE"
  ])
);

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveEmbeddedWorkflowState(prospect = {}, persisted = null) {
  if (persisted && typeof persisted === "object" && !Array.isArray(persisted)) {
    return persisted;
  }
  const raw = prospect.workflow_state;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

function hasQrStoredOrigin(prospect = {}) {
  const entry = upper(prospect.entry_method);
  const source = upper(prospect.source);
  return (
    entry === WHATSAPP_ENTRY_METHOD.QR ||
    source === upper(WHATSAPP_SOURCE.CAR_MAGNET)
  );
}

function hasVerifiedStoredIntakeOrigin(prospect = {}) {
  const entry = upper(prospect.entry_method);
  return VERIFIED_STORED_ENTRY_METHODS.has(entry);
}

/**
 * Sync durable recruiting-origin check for inbox membership.
 * Does not evaluate inbound referral payloads or BR-142 explicit disable.
 *
 * @returns {{ eligible: boolean, reason: string }}
 */
function evaluateRecruitingInboxEligibility(prospect = null, workflowState = null) {
  if (!prospect) {
    return { eligible: false, reason: "MISSING_PROSPECT" };
  }

  const wf = workflowState || resolveEmbeddedWorkflowState(prospect);

  if (wf.atlasAutomationEnabled === true) {
    return { eligible: true, reason: "EXPLICITLY_ENABLED" };
  }

  const storedProof = upper(wf.atlasEligibilitySource);
  if (VERIFIED_SOURCE_SET.has(storedProof)) {
    return { eligible: true, reason: "VERIFIED_ELIGIBILITY_SOURCE" };
  }

  if (hasQrStoredOrigin(prospect)) {
    return { eligible: true, reason: "QR_ATTRIBUTION" };
  }

  if (hasVerifiedStoredIntakeOrigin(prospect)) {
    return { eligible: true, reason: "VERIFIED_STORED_ORIGIN" };
  }

  return { eligible: false, reason: "NOT_RECRUITING_ORIGIN" };
}

function isRecruitingConversationEligibleForInbox(prospect, workflowState = null) {
  return evaluateRecruitingInboxEligibility(prospect, workflowState).eligible;
}

async function resolveRecruitingInboxEligibility(prospect = null, options = {}) {
  if (!prospect) {
    return { eligible: false, reason: "MISSING_PROSPECT" };
  }

  const embedded = resolveEmbeddedWorkflowState(prospect);
  let workflowState = { ...embedded, ...(options.workflowState || {}) };

  if (prospect.phone && !options.workflowState) {
    try {
      const loaded = await loadPersistedWorkflowState(prospect.phone, {
        organizationId: prospect.organization_id || prospect.organizationId || null,
        prospectId: prospect.id || null
      });
      workflowState = { ...loaded, ...embedded };
    } catch {
      workflowState = embedded;
    }
  }

  return evaluateRecruitingInboxEligibility(prospect, workflowState);
}

module.exports = {
  evaluateRecruitingInboxEligibility,
  isRecruitingConversationEligibleForInbox,
  resolveRecruitingInboxEligibility,
  hasQrStoredOrigin,
  hasVerifiedStoredIntakeOrigin,
  VERIFIED_SOURCE_SET
};
