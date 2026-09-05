/**
 * BR-156 / BR-234 — Unsupported Meta WhatsApp inbound review service.
 * Operational recovery only; BR-142 eligibility unchanged.
 * BR-234 allows contact-only 131060 reviews when no prospect exists.
 */

const {
  REVIEW_TYPE,
  REVIEW_STATUS,
  META_UNSUPPORTED_LEAD_ERROR_CODE,
  REVIEW_REASON,
  AUDIT_EVENT_TYPES
} = require("./constants");
const { ROLES } = require("../../security/roles");
const {
  shouldCreateUnsupportedInboundReview,
  extractMetaMessageErrors
} = require("./detection");
const {
  insertReview,
  findById,
  findByProviderMessageId,
  findPendingByProspectId,
  listPendingForOrganization,
  updateReview
} = require("../../repositories/unsupportedWhatsAppInboundReviewRepository");
const { canAcknowledgeProspect } = require("../newLeadAttentionEngine");
const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const { getCampaignIntakeAttributionService } = require("../campaignIntakeCode/campaignIntakeAttributionService");
const { loadPersistedWorkflowState, savePersistedWorkflowState } = require("../workflowStateStore");
const { findProspectInOrganization } = require("../../services/supabaseService");
const workflowEventService = require("../../services/workflowEventService");

let reviewRepository = {
  insertReview,
  findById,
  findByProviderMessageId,
  findPendingByProspectId,
  listPendingForOrganization,
  updateReview
};

function setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo) {
  reviewRepository = repo || {
    insertReview,
    findById,
    findByProviderMessageId,
    findPendingByProspectId,
    listPendingForOrganization,
    updateReview
  };
}

function resetUnsupportedWhatsAppInboundReviewRepositoryForTests() {
  reviewRepository = {
    insertReview,
    findById,
    findByProviderMessageId,
    findPendingByProspectId,
    listPendingForOrganization,
    updateReview
  };
}

async function emitReviewAudit(eventType, { organizationId, prospect, review, actorUserId, payload = {} }) {
  if (!prospect?.phone || !review?.id) {
    return null;
  }

  return workflowEventService.insertWorkflowEvent({
    prospectPhone: prospect.phone,
    eventType,
    actor: actorUserId || "SYSTEM",
    organizationId: organizationId || prospect.organization_id || null,
    payload: {
      reviewId: review.id,
      providerMessageId: review.providerMessageId,
      status: review.status,
      ...payload
    },
    correlationId: `unsupported_whatsapp_review:${review.id}:${eventType}`
  });
}

async function maybeCreateUnsupportedInboundReview({
  inbound,
  organizationSource,
  organizationId,
  prospect,
  campaignIntakeMatch = null,
  conversationLogId = null,
  correlationId = null,
  qrAttributed = false,
  qrTouch = null,
  observabilityId = null,
  dependencies = {}
} = {}) {
  const workflowState =
    dependencies.workflowState ||
    (prospect?.phone
      ? await loadPersistedWorkflowState(prospect.phone, {
          organizationId: organizationId || prospect.organization_id || null,
          prospectId: prospect.id || null
        }).catch(() => null)
      : null);

  const decision = await shouldCreateUnsupportedInboundReview({
    inbound,
    organizationSource,
    campaignIntakeMatch,
    prospect,
    qrAttributed,
    qrTouch,
    workflowState,
    dependencies
  });

  if (!decision.create) {
    return { created: false, reason: decision.reason };
  }

  const providerMessageId = String(inbound?.providerMessageId || "").trim();
  const senderPhone = String(prospect?.phone || inbound?.phoneE164 || inbound?.phone || "").trim();
  const phoneNumberId =
    inbound?.phoneNumberId || inbound?.rawValue?.metadata?.phone_number_id || null;
  // Implements BR-234 — prospect.id is optional; org + sender + destination stay required.
  if (!providerMessageId || !organizationId || !senderPhone || !phoneNumberId) {
    return { created: false, reason: "MISSING_REQUIRED_FIELDS" };
  }

  const existing = await reviewRepository.findByProviderMessageId(providerMessageId);
  if (existing) {
    return { created: false, reason: "DUPLICATE_PROVIDER_MESSAGE", review: existing };
  }

  const metaErrors = extractMetaMessageErrors(inbound?.rawMessage);
  const metaError = metaErrors.find((entry) => entry.code === META_UNSUPPORTED_LEAD_ERROR_CODE) || {};

  const displayPhoneNumber = inbound.rawValue?.metadata?.display_phone_number || null;
  const contactOnly = !prospect?.id;
  const metadata = contactOnly
    ? {
        messageType: inbound.messageType || "unsupported",
        reviewReason: REVIEW_REASON.META_UNSUPPORTED_131060_CONTACT_ONLY,
        contactOnly: true
      }
    : {
        messageType: inbound.messageType || "unsupported"
      };

  const result = await reviewRepository.insertReview({
    reviewType: REVIEW_TYPE.UNSUPPORTED_WHATSAPP_INBOUND_REVIEW,
    organizationId,
    prospectId: prospect?.id || null,
    ownerUserId: prospect?.owner_user_id || null,
    assignedOwnerUserId: prospect?.owner_user_id || null,
    senderPhoneE164: senderPhone,
    whatsappSenderId: inbound.whatsappSenderId || prospect?.whatsapp_sender_id || null,
    prospectName: prospect?.name || inbound.contactName || null,
    providerMessageId,
    destinationPhoneNumberId: phoneNumberId,
    destinationDisplayPhoneNumber: displayPhoneNumber,
    metaErrorCode: META_UNSUPPORTED_LEAD_ERROR_CODE,
    metaErrorTitle: metaError.title || "This message is unavailable.",
    status: REVIEW_STATUS.PENDING_REVIEW,
    observabilityId,
    conversationLogId,
    correlationId,
    receivedAt: inbound.timestamp || new Date().toISOString(),
    metadata
  });

  if (!result.ok) {
    logWhatsAppStage("unsupported_whatsapp_inbound_review_create_failed", {
      level: "warn",
      providerMessageId,
      reason: result.reason,
      phone: senderPhone || null
    });
    return { created: false, reason: result.reason };
  }

  logWhatsAppStage("unsupported_whatsapp_inbound_review_created", {
    phone: senderPhone || null,
    providerMessageId,
    reviewId: result.row.id,
    organizationId,
    contactOnly
  });

  // Do not write pendingUnsupportedMetaRecovery without a prospect (BR-234).
  if (prospect?.id && prospect?.phone) {
    await savePersistedWorkflowState(
      prospect.phone,
      { pendingUnsupportedMetaRecovery: true },
      {
        organizationId: organizationId || prospect.organization_id || null,
        prospectId: prospect.id
      }
    ).catch(() => null);
  }

  return { created: true, review: result.row };
}

async function clearPendingUnsupportedMetaRecoveryFlag(prospect, organizationId) {
  if (!prospect?.phone) {
    return;
  }

  await savePersistedWorkflowState(
    prospect.phone,
    { pendingUnsupportedMetaRecovery: false },
    {
      organizationId: organizationId || prospect.organization_id || null,
      prospectId: prospect.id || null
    }
  ).catch(() => null);
}

async function markPendingReviewsRecoveredAutomatically({
  prospect,
  organizationId,
  campaignCode = null,
  actorUserId = null,
  dependencies = {}
} = {}) {
  if (!prospect?.id || !organizationId) {
    return { updated: 0 };
  }

  const pending = await reviewRepository.findPendingByProspectId(prospect.id, organizationId);
  if (!pending.length) {
    return { updated: 0 };
  }

  let updated = 0;
  for (const review of pending) {
    const patchResult = await reviewRepository.updateReview(review.id, {
      status: REVIEW_STATUS.RECOVERED_AUTOMATICALLY,
      reviewedAt: new Date().toISOString(),
      reviewedByUserId: actorUserId || null,
      recoveryCampaignCode: campaignCode || null
    });
    if (patchResult.ok) {
      updated += 1;
      await emitReviewAudit(AUDIT_EVENT_TYPES.RECOVERED, {
        organizationId,
        prospect,
        review: patchResult.row,
        actorUserId,
        payload: {
          recoveryMode: "automatic",
          campaignCode: campaignCode || null
        }
      });
    }
  }

  if (updated > 0) {
    await clearPendingUnsupportedMetaRecoveryFlag(prospect, organizationId);
  }

  return { updated, reviews: pending };
}

async function listPendingReviewsForRequest({ organizationId, authContext, limit = 20 } = {}) {
  const assignedOwnerUserId =
    authContext?.role === "AGENT" || authContext?.role === "RECRUITER"
      ? authContext.userId
      : null;

  return reviewRepository.listPendingForOrganization({
    organizationId,
    assignedOwnerUserId,
    limit
  });
}

function canDismissContactOnlyReview(authContext, organizationId) {
  if (!authContext || String(authContext.organizationId || "") !== String(organizationId || "")) {
    return false;
  }
  return authContext.role === ROLES.ADMINISTRATOR || authContext.role === ROLES.RVP;
}

async function dismissUnsupportedInboundReview({
  reviewId,
  organizationId,
  authContext,
  dependencies = {}
} = {}) {
  const findProspect = dependencies.findProspectInOrganization || findProspectInOrganization;
  const review = await findReviewInOrganization(reviewId, organizationId);
  if (!review) {
    return { ok: false, reason: "NOT_FOUND", status: 404 };
  }

  const contactOnly = !review.prospectId;
  let prospect = null;
  if (contactOnly) {
    if (!canDismissContactOnlyReview(authContext, organizationId)) {
      return { ok: false, reason: "FORBIDDEN", status: 403 };
    }
  } else {
    prospect = await findProspect(review.senderPhoneE164, organizationId);
    if (!prospect || !canAcknowledgeProspect(authContext, prospect)) {
      return { ok: false, reason: "FORBIDDEN", status: 403 };
    }
  }

  if (review.status !== REVIEW_STATUS.PENDING_REVIEW) {
    return { ok: true, alreadyResolved: true, review };
  }

  const patchResult = await reviewRepository.updateReview(review.id, {
    status: REVIEW_STATUS.DISMISSED_REVIEWED,
    reviewedAt: new Date().toISOString(),
    reviewedByUserId: authContext.userId || null
  });

  if (!patchResult.ok) {
    return { ok: false, reason: patchResult.reason || "UPDATE_FAILED", status: 500 };
  }

  await emitReviewAudit(AUDIT_EVENT_TYPES.DISMISSED, {
    organizationId,
    prospect: prospect || { phone: review.senderPhoneE164 },
    review: patchResult.row,
    actorUserId: authContext.userId
  });

  if (prospect) {
    await clearPendingUnsupportedMetaRecoveryFlag(prospect, organizationId);
  }

  return { ok: true, review: patchResult.row };
}

async function findReviewInOrganization(reviewId, organizationId) {
  return reviewRepository.findById(reviewId, organizationId);
}

async function confirmUnsupportedInboundReview({
  reviewId,
  organizationId,
  authContext,
  campaignCode = null,
  dependencies = {}
} = {}) {
  const findProspect = dependencies.findProspectInOrganization || findProspectInOrganization;
  const intakeService =
    dependencies.campaignIntakeAttributionService || getCampaignIntakeAttributionService();

  const review = await findReviewInOrganization(reviewId, organizationId);
  if (!review) {
    return { ok: false, reason: "NOT_FOUND", status: 404 };
  }

  // Implements BR-234 — contact-only reviews are not a promotion path.
  if (!review.prospectId) {
    return { ok: false, reason: "CONTACT_ONLY_NO_PROSPECT", status: 400 };
  }

  const prospect = await findProspect(review.senderPhoneE164, organizationId);
  if (!prospect || !canAcknowledgeProspect(authContext, prospect)) {
    return { ok: false, reason: "FORBIDDEN", status: 403 };
  }

  if (review.status !== REVIEW_STATUS.PENDING_REVIEW) {
    return { ok: true, alreadyResolved: true, review };
  }

  const trimmedCode = String(campaignCode || "").trim().toUpperCase();
  let attributionResult = null;

  if (trimmedCode) {
    const lookup = await intakeService.lookupInboundMatch({
      organizationId,
      whatsappPhoneNumberId: review.destinationPhoneNumberId,
      messageBody: trimmedCode
    });

    if (!lookup.matched) {
      return { ok: false, reason: lookup.reason || "CODE_NOT_FOUND", status: 400 };
    }

    const workflowState = await loadPersistedWorkflowState(prospect.phone, {
      organizationId,
      prospectId: prospect.id || null
    }).catch(() => null);

    attributionResult = await intakeService.establishInboundAttribution({
      match: lookup,
      prospect,
      created: false,
      workflowState,
      providerMessageId: review.providerMessageId,
      phoneNumberId: review.destinationPhoneNumberId,
      organizationId
    });

    if (!attributionResult.ok) {
      return { ok: false, reason: attributionResult.reason || "ATTRIBUTION_FAILED", status: 400 };
    }

    if (!attributionResult.recruitingEligible && !attributionResult.iulReviewEligible) {
      return {
        ok: false,
        reason: attributionResult.eligibilityDecision || "NOT_ELIGIBLE",
        status: 400
      };
    }
  }

  const patchResult = await reviewRepository.updateReview(review.id, {
    status: REVIEW_STATUS.CONFIRMED_MANUAL,
    reviewedAt: new Date().toISOString(),
    reviewedByUserId: authContext.userId || null,
    recoveryCampaignCode: trimmedCode || null,
    metadata: {
      ...(review.metadata || {}),
      manualConfirmationWithoutCode: !trimmedCode,
      attributionEstablished: Boolean(attributionResult?.ok)
    }
  });

  if (!patchResult.ok) {
    return { ok: false, reason: patchResult.reason || "UPDATE_FAILED", status: 500 };
  }

  await emitReviewAudit(AUDIT_EVENT_TYPES.CONFIRMED, {
    organizationId,
    prospect,
    review: patchResult.row,
    actorUserId: authContext.userId,
    payload: {
      campaignCode: trimmedCode || null,
      attributionEstablished: Boolean(attributionResult?.ok),
      recruitingEligible: attributionResult?.recruitingEligible || false,
      iulReviewEligible: attributionResult?.iulReviewEligible || false
    }
  });

  await clearPendingUnsupportedMetaRecoveryFlag(prospect, organizationId);

  return {
    ok: true,
    review: patchResult.row,
    attribution: attributionResult
  };
}

module.exports = {
  maybeCreateUnsupportedInboundReview,
  markPendingReviewsRecoveredAutomatically,
  listPendingReviewsForRequest,
  dismissUnsupportedInboundReview,
  confirmUnsupportedInboundReview,
  setUnsupportedWhatsAppInboundReviewRepositoryForTests,
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests
};
