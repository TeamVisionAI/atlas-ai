/**
 * BR-215 — Owner-only review for BR-193 META_AD_DESTINATION fallback prospects.
 * Does not treat META or Meta 131060 as CTWA. Does not authorize automated outbound.
 */

const {
  hasRealStoredCtwaEvidence,
  isMetaAdDestinationStamp,
  isOrdinaryPersonalWhatsAppContact,
  persistVerifiedAtlasEligibilitySource,
  POSITIVE_LEAD_PROVENANCE_SOURCE_SET
} = require("../atlasInboundAutomationEligibility");
const { buildDepromotionPatch } = require("../prospectPromotionEligibility");
const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../workflowStateStore");
const { AD_DESTINATION_FALLBACK_REASON } = require("../metaAdDestinationFallback");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../whatsappConstants");
const workflowEventService = require("../../services/workflowEventService");
const {
  SUSPECTED_META_LEAD_REVIEW,
  HUMAN_VERIFIED_META_LEAD,
  META_LEAD_REVIEW_STATUSES,
  META_LEAD_REVIEW_AUDIT
} = require("./constants");

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveWorkflow(prospect = {}, workflowState = null) {
  if (workflowState && typeof workflowState === "object" && !Array.isArray(workflowState)) {
    return workflowState;
  }
  const raw = prospect?.workflow_state;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

function readMetaLeadReview(workflowState = {}) {
  const raw = workflowState.metaLeadReview;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function mergeWorkflowState(prospect, loaded) {
  const embedded =
    prospect?.workflow_state && typeof prospect.workflow_state === "object"
      ? prospect.workflow_state
      : {};
  const stored = loaded && typeof loaded === "object" ? loaded : {};
  const merged = { ...embedded };
  for (const [key, value] of Object.entries(stored)) {
    if (value != null) {
      merged[key] = value;
    }
  }
  return merged;
}

function isOwnerOfProspect(prospect, userId) {
  return Boolean(
    userId &&
      prospect?.owner_user_id &&
      String(prospect.owner_user_id) === String(userId)
  );
}

const LEGACY_NON_BR193_SOURCES = Object.freeze(
  new Set([
    upper(WHATSAPP_SOURCE.UNKNOWN),
    upper(WHATSAPP_SOURCE.PERSONAL_WHATSAPP),
    "FACEBOOK",
    "CLICK_TO_WHATSAPP"
  ])
);

const LEGACY_NON_BR193_ENTRY_METHODS = Object.freeze(
  new Set([
    WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP
  ])
);

/**
 * Durable create-time origin that is not a BR-193 promotion.
 * A later META_AD_DESTINATION continuation stamp is not enough.
 * Null source/entry (Brenda / Armando / Maria) is the BR-193 create pattern.
 */
function hasLegacyNonBr193CreateOrigin(prospect = {}) {
  const source = upper(prospect?.source);
  const entry = upper(prospect?.entry_method);
  if (
    source === upper(WHATSAPP_SOURCE.META_AD_DESTINATION) ||
    entry === WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION
  ) {
    return false;
  }
  return LEGACY_NON_BR193_SOURCES.has(source) || LEGACY_NON_BR193_ENTRY_METHODS.has(entry);
}

function isKnownPersonalOrLegacyNonLeadContact(prospect = {}, workflowState = null) {
  const wf = resolveWorkflow(prospect, workflowState);
  if (isOrdinaryPersonalWhatsAppContact(prospect, wf)) {
    return true;
  }
  return hasLegacyNonBr193CreateOrigin(prospect);
}

/**
 * Derived review membership. No production write required.
 * 131060 is not consulted.
 */
function evaluateSuspectedMetaLeadReview(prospect = null, workflowState = null) {
  if (!prospect) {
    return { review: false, reason: "MISSING_PROSPECT" };
  }

  const wf = resolveWorkflow(prospect, workflowState);
  const review = readMetaLeadReview(wf);
  const status = upper(review.status);

  if (status === META_LEAD_REVIEW_STATUSES.DISMISSED_PERSONAL) {
    return { review: false, reason: "DISMISSED_PERSONAL" };
  }
  if (status === META_LEAD_REVIEW_STATUSES.CONFIRMED) {
    return { review: false, reason: "ALREADY_CONFIRMED" };
  }
  if (upper(wf.atlasEligibilitySource) === HUMAN_VERIFIED_META_LEAD) {
    return { review: false, reason: "HUMAN_VERIFIED_META_LEAD" };
  }
  if (POSITIVE_LEAD_PROVENANCE_SOURCE_SET.has(upper(wf.atlasEligibilitySource))) {
    return { review: false, reason: "STRONGER_VERIFIED_PROVENANCE" };
  }
  if (hasRealStoredCtwaEvidence(prospect, wf)) {
    return { review: false, reason: "STORED_CTWA_EVIDENCE" };
  }
  if (isOrdinaryPersonalWhatsAppContact(prospect, wf)) {
    return { review: false, reason: "PERSONAL_WHATSAPP_NOT_ELIGIBLE" };
  }
  if (hasLegacyNonBr193CreateOrigin(prospect)) {
    return { review: false, reason: "LEGACY_NON_BR193_CREATE_ORIGIN" };
  }
  if (wf.prospectPromotion?.operational === false) {
    return { review: false, reason: "EXPLICITLY_DEPROMOTED" };
  }
  if (wf.atlasAutomationEnabled === true) {
    return { review: false, reason: "EXPLICITLY_ENABLED" };
  }
  if (!isMetaAdDestinationStamp(prospect, wf)) {
    return { review: false, reason: "NOT_META_AD_DESTINATION_FALLBACK" };
  }

  return {
    review: true,
    reason: SUSPECTED_META_LEAD_REVIEW,
    ownerUserId: prospect.owner_user_id || null,
    originalFallbackReason:
      review.originalFallbackReason || AD_DESTINATION_FALLBACK_REASON
  };
}

function isSuspectedMetaLeadReview(prospect, workflowState = null) {
  return evaluateSuspectedMetaLeadReview(prospect, workflowState).review === true;
}

function isOwnerVisibleSuspectedMetaLead(prospect, viewerUserId, workflowState = null) {
  return (
    isSuspectedMetaLeadReview(prospect, workflowState) &&
    isOwnerOfProspect(prospect, viewerUserId)
  );
}

function buildHumanVerifiedMetaLeadPatch({
  actorUserId,
  connectionId = null,
  phoneNumberId = null,
  at = new Date()
} = {}) {
  const confirmedAt = at instanceof Date ? at.toISOString() : String(at);
  return {
    atlasEligibilitySource: HUMAN_VERIFIED_META_LEAD,
    metaLeadReview: {
      status: META_LEAD_REVIEW_STATUSES.CONFIRMED,
      confirmedByUserId: actorUserId || null,
      confirmedAt,
      originalFallbackReason: AD_DESTINATION_FALLBACK_REASON,
      connectionId: connectionId || null,
      phoneNumberId: phoneNumberId || null
    }
  };
}

function buildDismissedPersonalPatch({ actorUserId, at = new Date() } = {}) {
  const dismissedAt = at instanceof Date ? at.toISOString() : String(at);
  return {
    ...buildDepromotionPatch({
      reason: "HUMAN_MARKED_PERSONAL_CONTACT",
      at: dismissedAt
    }),
    metaLeadReview: {
      status: META_LEAD_REVIEW_STATUSES.DISMISSED_PERSONAL,
      dismissedByUserId: actorUserId || null,
      dismissedAt,
      originalFallbackReason: AD_DESTINATION_FALLBACK_REASON
    }
  };
}

async function emitMetaLeadReviewAudit(eventType, { organizationId, prospect, actorUserId, payload = {} }) {
  if (!prospect?.phone) {
    return null;
  }
  return workflowEventService.insertWorkflowEvent({
    prospectPhone: prospect.phone,
    eventType,
    actor: actorUserId || "SYSTEM",
    organizationId: organizationId || prospect.organization_id || null,
    payload: {
      rule: "BR-215",
      ...payload
    },
    correlationId: `br215:${prospect.id || prospect.phone}:${eventType}`
  });
}

async function confirmMetaLead({
  prospect,
  organizationId,
  authContext,
  connectionId = null,
  phoneNumberId = null,
  at = new Date()
} = {}) {
  if (!prospect) {
    return { ok: false, reason: "NOT_FOUND", status: 404 };
  }
  if (!isOwnerOfProspect(prospect, authContext?.userId)) {
    return { ok: false, reason: "OWNER_ONLY", status: 403 };
  }

  const loaded = await loadPersistedWorkflowState(prospect.phone, {
    organizationId: organizationId || prospect.organization_id || null,
    prospectId: prospect.id || null
  }).catch(() => null);
  const existing = mergeWorkflowState(prospect, loaded);

  if (upper(existing?.atlasEligibilitySource) === HUMAN_VERIFIED_META_LEAD) {
    return { ok: true, alreadyResolved: true, source: HUMAN_VERIFIED_META_LEAD };
  }
  if (hasRealStoredCtwaEvidence(prospect, existing)) {
    return { ok: true, alreadyResolved: true, source: existing?.atlasEligibilitySource || "CTWA_REFERRAL" };
  }

  const decision = evaluateSuspectedMetaLeadReview(prospect, existing);
  if (!decision.review && decision.reason !== "ALREADY_CONFIRMED") {
    return { ok: false, reason: decision.reason, status: 409 };
  }

  await persistVerifiedAtlasEligibilitySource(prospect.phone, HUMAN_VERIFIED_META_LEAD, {
    organizationId: organizationId || prospect.organization_id || null,
    prospectId: prospect.id || null,
    workflowState: existing
  });

  const patch = buildHumanVerifiedMetaLeadPatch({
    actorUserId: authContext?.userId || null,
    connectionId,
    phoneNumberId,
    at
  });
  const saved = await savePersistedWorkflowState(prospect.phone, patch, {
    organizationId: organizationId || prospect.organization_id || null,
    prospectId: prospect.id || null
  });

  try {
    await emitMetaLeadReviewAudit(META_LEAD_REVIEW_AUDIT.CONFIRMED, {
      organizationId: organizationId || prospect.organization_id || null,
      prospect,
      actorUserId: authContext?.userId || null,
      payload: {
        atlasEligibilitySource: HUMAN_VERIFIED_META_LEAD,
        originalFallbackReason: AD_DESTINATION_FALLBACK_REASON,
        connectionId: connectionId || null,
        phoneNumberId: phoneNumberId || null,
        confirmedByUserId: authContext?.userId || null,
        confirmedAt: patch.metaLeadReview.confirmedAt
      }
    });
  } catch {
    /* audit must not block confirmation */
  }

  return {
    ok: true,
    source: HUMAN_VERIFIED_META_LEAD,
    workflow: saved
  };
}

async function dismissMetaLeadAsPersonal({
  prospect,
  organizationId,
  authContext,
  at = new Date()
} = {}) {
  if (!prospect) {
    return { ok: false, reason: "NOT_FOUND", status: 404 };
  }
  if (!isOwnerOfProspect(prospect, authContext?.userId)) {
    return { ok: false, reason: "OWNER_ONLY", status: 403 };
  }

  const loaded = await loadPersistedWorkflowState(prospect.phone, {
    organizationId: organizationId || prospect.organization_id || null,
    prospectId: prospect.id || null
  }).catch(() => null);
  const existing = mergeWorkflowState(prospect, loaded);

  if (readMetaLeadReview(existing).status === META_LEAD_REVIEW_STATUSES.DISMISSED_PERSONAL) {
    return { ok: true, alreadyResolved: true };
  }
  if (hasRealStoredCtwaEvidence(prospect, existing)) {
    return { ok: false, reason: "STRONGER_VERIFIED_PROVENANCE", status: 409 };
  }
  const canDismiss =
    evaluateSuspectedMetaLeadReview(prospect, existing).review === true ||
    upper(existing?.atlasEligibilitySource) === HUMAN_VERIFIED_META_LEAD ||
    isMetaAdDestinationStamp(prospect, existing);
  if (!canDismiss) {
    return { ok: false, reason: "NOT_META_LEAD_REVIEW", status: 409 };
  }

  const patch = buildDismissedPersonalPatch({
    actorUserId: authContext?.userId || null,
    at
  });
  const saved = await savePersistedWorkflowState(prospect.phone, patch, {
    organizationId: organizationId || prospect.organization_id || null,
    prospectId: prospect.id || null
  });

  try {
    await emitMetaLeadReviewAudit(META_LEAD_REVIEW_AUDIT.DISMISSED, {
      organizationId: organizationId || prospect.organization_id || null,
      prospect,
      actorUserId: authContext?.userId || null,
      payload: {
        status: META_LEAD_REVIEW_STATUSES.DISMISSED_PERSONAL,
        dismissedByUserId: authContext?.userId || null,
        dismissedAt: patch.metaLeadReview.dismissedAt
      }
    });
  } catch {
    /* audit must not block dismissal */
  }

  return { ok: true, workflow: saved };
}

module.exports = {
  evaluateSuspectedMetaLeadReview,
  isSuspectedMetaLeadReview,
  isOwnerVisibleSuspectedMetaLead,
  isOwnerOfProspect,
  hasLegacyNonBr193CreateOrigin,
  isKnownPersonalOrLegacyNonLeadContact,
  buildHumanVerifiedMetaLeadPatch,
  buildDismissedPersonalPatch,
  confirmMetaLead,
  dismissMetaLeadAsPersonal,
  SUSPECTED_META_LEAD_REVIEW,
  HUMAN_VERIFIED_META_LEAD
};
