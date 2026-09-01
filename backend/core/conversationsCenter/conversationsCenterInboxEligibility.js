/**
 * Conversations Center recruiting inbox eligibility (presentation only).
 * Durable positive recruiting origin — separate from BR-142 auto-reply session gates.
 * Implements inbox membership for Active / Atlas / Human / Needs Attention tabs.
 */

const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../whatsappConstants");
const { loadPersistedWorkflowState } = require("../workflowStateStore");
const {
  evaluatePositiveAtlasLeadProvenance,
  isOrdinaryPersonalWhatsAppContact,
  VERIFIED_SOURCE_SET
} = require("../atlasInboundAutomationEligibility");

const VERIFIED_STORED_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.QR,
    WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
    WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION,
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

  // Implements BR-159 / BR-165 / BR-199 — personal inbound is not a prospect.
  if (isOrdinaryPersonalWhatsAppContact(prospect, wf)) {
    return { eligible: false, reason: "PERSONAL_WHATSAPP_NOT_ELIGIBLE" };
  }

  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, wf);
  if (provenance.eligible) {
    return provenance;
  }

  return { eligible: false, reason: provenance.reason || "NOT_RECRUITING_ORIGIN" };
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
