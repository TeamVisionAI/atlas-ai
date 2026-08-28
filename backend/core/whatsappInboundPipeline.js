/**
 * Sprint 11.1 + 11.4 Phase A — Inbound WhatsApp message pipeline.
 * Webhook → prospect resolve → persist → event engine → Conversation Engine → outbound.
 *
 * Inbound provider-message idempotency: org/WABA fail-closed (read-only), then
 * atomic claim of whatsapp:inbound:{providerMessageId} BEFORE locateOrCreate,
 * QR attribution, logConversation, hub, V2/CE, or outbound.
 */

const workflowEventService = require("../services/workflowEventService");
const { logConversation } = require("../services/logService");
const { processConversationAfterInbound } = require("./communicationHub");
const whatsappProspectResolver = require("./whatsappProspectResolver");
const { resolveStoragePhone } = whatsappProspectResolver;
const {
  findProspectInOrganization
} = require("../services/supabaseService");
const {
  resolveWhatsAppInboundOrganizationId
} = require("./whatsappInboundOrganizationResolver");
const { buildInboundCorrelationId } = require("./whatsappInboundClaim");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { loadPersistedWorkflowState } = require("./workflowStateStore");
const {
  getCampaignIntakeAttributionService,
  setCampaignIntakeAttributionServiceForTests
} = require("./campaignIntakeCode/campaignIntakeAttributionService");
const { stripCampaignIntakeToken } = require("./campaignIntakeCode/intakeCodeToken");
const recruitingWorkflowHooks = require("./recruitingWorkflowHooks");
const { resolveProspectCommunicationCode } = require("./prospectLanguage");
const {
  conversationDeliveredReply,
  prospectHasDeliveredAutomatedOutbound,
  prospectHasFailedAutomatedOutboundOnly
} = require("./whatsappAutomatedReplyDelivery");
const {
  buildStalledFirstReplyRecoveryContext,
  restoreStalledFirstReplyRecruitingState
} = require("./whatsappInboundFirstReplyRecoveryContext");
const {
  resolveWhatsAppSenderIdentityFromInbound
} = require("./whatsappSenderIdentity");
const {
  isRecruitingCampaignIntakeFirstTurnBurst,
  shouldSkipDuplicateRecruitingFirstTurnReply
} = require("./recruitingFirstTurnBurst");
const {
  maybeCreateUnsupportedInboundReview,
  markPendingReviewsRecoveredAutomatically
} = require("./unsupportedWhatsAppInboundReview/unsupportedWhatsAppInboundReviewService");

function duplicateSkipResult(correlationId, providerMessageId, phone) {
  logWhatsAppStage("message_duplicate_skipped", {
    providerMessageId,
    phone
  });

  return {
    success: true,
    skipped: true,
    reason: "DUPLICATE_PROVIDER_MESSAGE",
    correlationId
  };
}

async function applyInboundAttentionUpdate(prospect, conversation) {
  try {
    const {
      markAiResponding,
      markHumanAttentionRequired
    } = require("./newLeadAttentionEngine");

    if (conversationDeliveredReply(conversation)) {
      await markAiResponding(prospect, { waitingForProspect: true });
    } else if (
      conversation &&
      (conversation.success === false ||
        conversation.humanAssist ||
        conversation.reason === "CONVERSATION_ENGINE_ERROR")
    ) {
      await markHumanAttentionRequired(
        prospect,
        conversation.reason || conversation.error || "ai_or_delivery_failure"
      );
    }
  } catch (attentionError) {
    logWhatsAppStage("br080_attention_update_failed", {
      level: "warn",
      phone: prospect?.phone || null,
      error: attentionError.message
    });
  }
}

async function prospectHasAutomatedOutboundReply(phone, organizationId) {
  if (await prospectHasDeliveredAutomatedOutbound(phone, organizationId)) {
    return true;
  }
  return !(await prospectHasFailedAutomatedOutboundOnly(phone, organizationId));
}

async function attemptStalledFirstReplyRecovery({
  inbound,
  correlationId,
  claimedOrganizationId,
  runHub,
  dependencies = {}
}) {
  const findProspect =
    dependencies.findProspectInOrganization || findProspectInOrganization;
  const hasOutbound =
    dependencies.prospectHasAutomatedOutboundReply || prospectHasAutomatedOutboundReply;
  const intakeService =
    dependencies.campaignIntakeAttributionService ||
    getCampaignIntakeAttributionService();

  const prospect =
    (await findProspect(inbound.phone, claimedOrganizationId)) ||
    (await findProspect(resolveStoragePhone(inbound.phone), claimedOrganizationId));

  if (!prospect?.phone) {
    return null;
  }

  if (await hasOutbound(prospect.phone, claimedOrganizationId)) {
    return null;
  }

  if (await hasOutbound(prospect.phone, claimedOrganizationId)) {
    return null;
  }

  const recoveryContext = await buildStalledFirstReplyRecoveryContext({
    inbound,
    prospect,
    organizationId: claimedOrganizationId,
    intakeService,
    dependencies
  });

  if (!recoveryContext.ok) {
    logWhatsAppStage("inbound_first_reply_recovery_context_failed", {
      phone: prospect.phone,
      providerMessageId: inbound.providerMessageId || null,
      organizationId: claimedOrganizationId || null,
      reason: recoveryContext.reason
    });
    return null;
  }

  const {
    inboundForAutomation,
    campaignIntakeMatch,
    phoneNumberId,
    workflowState,
    attribution,
    ctwaReferral
  } = recoveryContext;

  logWhatsAppStage("inbound_first_reply_recovery_attempted", {
    phone: prospect.phone,
    providerMessageId: inbound.providerMessageId || null,
    organizationId: claimedOrganizationId || null
  });

  const claimRecovery =
    dependencies.claimFirstReplyRecovery ||
    workflowEventService.claimFirstReplyRecovery;
  const recoveryClaim = await claimRecovery({
    correlationId,
    prospectPhone: prospect.phone,
    organizationId: claimedOrganizationId || null,
    providerMessageId: inbound.providerMessageId || null
  });
  if (!recoveryClaim?.claimed) {
    return null;
  }

  await restoreStalledFirstReplyRecruitingState({
    intakeService,
    campaignIntakeMatch,
    prospect,
    organizationId: claimedOrganizationId,
    providerMessageId: inbound.providerMessageId || null,
    phoneNumberId,
    workflowState,
    attribution,
    ctwaReferral: recoveryContext.ctwaReferral || null,
    whatsappConnectionSource: inboundForAutomation.whatsappConnectionSource || null
  }).catch((error) => {
    logWhatsAppStage("inbound_first_reply_recovery_state_restore_failed", {
      level: "warn",
      phone: prospect.phone,
      providerMessageId: inbound.providerMessageId || null,
      error: error.message
    });
  });

  try {
    await recruitingWorkflowHooks.onMessageReceived({
      phone: prospect.phone,
      message: inbound.body || inboundForAutomation.body,
      organizationId: claimedOrganizationId || prospect.organization_id || null
    });
  } catch (hookError) {
    logWhatsAppStage("inbound_first_reply_recovery_hook_failed", {
      level: "warn",
      phone: prospect.phone,
      error: hookError.message
    });
  }

  let conversation = null;
  try {
    conversation = await runHub({
      inbound: inboundForAutomation,
      storagePhone: prospect.phone,
      prospect,
      contactName: prospect.name || inbound.contactName,
      qrAttributed: false
    });
  } catch (error) {
    logWhatsAppStage("inbound_first_reply_recovery_failed", {
      phone: prospect.phone,
      providerMessageId: inbound.providerMessageId || null,
      level: "error",
      error: error.message
    });
    conversation = {
      success: false,
      replied: false,
      reason: "CONVERSATION_ENGINE_ERROR",
      error: error.message
    };
  }

  await applyInboundAttentionUpdate(prospect, conversation);

  if (!conversationDeliveredReply(conversation)) {
    logWhatsAppStage("inbound_first_reply_recovery_delivery_incomplete", {
      phone: prospect.phone,
      providerMessageId: inbound.providerMessageId || null,
      reason: conversation?.reason || conversation?.eligibilityReason || "DELIVERY_INCOMPLETE"
    });
    return null;
  }

  logWhatsAppStage("inbound_first_reply_recovery_succeeded", {
    phone: prospect.phone,
    providerMessageId: inbound.providerMessageId || null
  });

  return {
    success: true,
    skipped: false,
    recovered: true,
    reason: "DUPLICATE_INBOUND_FIRST_REPLY_RECOVERED",
    phone: prospect.phone,
    correlationId,
    conversation,
    organizationId: claimedOrganizationId || prospect.organization_id || null,
    prospectId: prospect.id || null,
    ownerUserId: prospect.owner_user_id || null
  };
}

/**
 * @param {Object} inbound — normalized message from whatsappWebhookParser
 * @param {Object} [dependencies] — test seams only
 */
async function processInboundWhatsAppMessage(inbound, dependencies = {}) {
  const providerMessageId = String(inbound?.providerMessageId || "").trim();
  if (!providerMessageId) {
    return {
      success: false,
      skipped: false,
      error: "MISSING_PROVIDER_MESSAGE_ID"
    };
  }

  const correlationId = buildInboundCorrelationId(providerMessageId);
  const resolveOrg =
    dependencies.resolveWhatsAppInboundOrganizationId ||
    resolveWhatsAppInboundOrganizationId;
  const claimInbound =
    dependencies.claimWhatsAppInboundCorrelation ||
    workflowEventService.claimWhatsAppInboundCorrelation;
  const locateOrCreate =
    dependencies.locateOrCreateWhatsAppProspect ||
    ((args) => whatsappProspectResolver.locateOrCreateWhatsAppProspect(args));
  const persistInboundLog = dependencies.logConversation || logConversation;
  const runHub =
    dependencies.processConversationAfterInbound ||
    processConversationAfterInbound;

  // Read-only org/WABA fail-closed MUST precede claim so a mismatched asset
  // cannot poison the provider-message lock (replay with the correct WABA still works).
  const {
    organizationId: claimedOrganizationId,
    source: organizationSource = null,
    ownerUserId: claimedOwnerUserId = null
  } = await resolveOrg({
    phoneNumberId:
      inbound.phoneNumberId || inbound.rawValue?.metadata?.phone_number_id || null,
    wabaId: inbound.wabaId || null
  });

  const claim = await claimInbound({
    correlationId,
    providerMessageId,
    prospectPhone: inbound.phone,
    organizationId: claimedOrganizationId || null
  });

  if (!claim?.claimed) {
    if (claim?.reason === "DUPLICATE_PROVIDER_MESSAGE") {
      if (dependencies.disableFirstReplyRecovery !== true) {
        const recovered = await attemptStalledFirstReplyRecovery({
          inbound,
          correlationId,
          claimedOrganizationId,
          runHub,
          dependencies
        });
        if (recovered) {
          return recovered;
        }
      }
      return duplicateSkipResult(correlationId, providerMessageId, inbound.phone);
    }
    return {
      success: false,
      skipped: false,
      error: claim?.reason || "INBOUND_CLAIM_FAILED",
      correlationId
    };
  }

  const body = inbound.body || `[${inbound.messageType} message]`;
  const phoneNumberId =
    inbound.phoneNumberId || inbound.rawValue?.metadata?.phone_number_id || null;
  const senderIdentity = resolveWhatsAppSenderIdentityFromInbound(inbound);

  if (!senderIdentity?.isUsable) {
    logWhatsAppStage("whatsapp_sender_identity_unusable", {
      level: "error",
      providerMessageId: inbound.providerMessageId,
      phone: inbound.phone || null,
      whatsappSenderId: inbound.whatsappSenderId || null,
      reason: senderIdentity?.reason || "WHATSAPP_SENDER_IDENTITY_UNUSABLE"
    });
    return {
      success: false,
      skipped: false,
      error: senderIdentity?.reason || "WHATSAPP_SENDER_IDENTITY_UNUSABLE",
      correlationId
    };
  }

  const inboundWithIdentity = {
    ...inbound,
    phone: senderIdentity.storageKey,
    phoneE164: senderIdentity.phoneE164 || null,
    whatsappSenderId: senderIdentity.whatsappSenderId,
    whatsappUsername: senderIdentity.whatsappUsername || null,
    contactName: senderIdentity.displayName || inbound.contactName,
    senderIdentity
  };

  const intakeService =
    dependencies.campaignIntakeAttributionService ||
    getCampaignIntakeAttributionService();

  let intakeLookup = await intakeService.lookupInboundMatch({
    organizationId: claimedOrganizationId,
    whatsappPhoneNumberId: phoneNumberId,
    messageBody: body
  });

  const {
    prospect,
    created,
    storagePhone,
    organizationId,
    qrAttribution,
    campaignIntakeMatch,
    contactOnly,
    promotionDeniedReason
  } =
    await locateOrCreate({
      phone: inboundWithIdentity.phone,
      name: inboundWithIdentity.contactName,
      firstMessage: body,
      correlationBase: correlationId,
      phoneNumberId,
      wabaId: inbound.wabaId || null,
      providerMessageId: inbound.providerMessageId || null,
      ctwaReferral: inbound.ctwaReferral || null,
      campaignIntakeMatch: intakeLookup?.matched ? intakeLookup : null,
      senderIdentity,
      whatsappConnectionOwnerUserId: claimedOwnerUserId,
      whatsappConnectionSource: organizationSource
    });

  // Implements BR-159 — unknown/personal inbound is logged, not promoted.
  if (!prospect) {
    const logResult = await persistInboundLog({
      phone: storagePhone || inboundWithIdentity.phone,
      name: inboundWithIdentity.contactName || inbound.contactName || "Unknown",
      direction: "incoming",
      message: body,
      intent: "WHATSAPP_INBOUND",
      pipeline: "CONTACT",
      currentStep: "CONTACT",
      organizationId: claimedOrganizationId || null,
      language: null,
      city: null,
      state: null,
      eventCorrelationId: correlationId,
      providerMessageId: inbound.providerMessageId,
      rawWebhookPayload: {
        message: inbound.rawMessage,
        valueMetadata: {
          messaging_product: inbound.rawValue?.messaging_product || "whatsapp",
          metadata: inbound.rawValue?.metadata || null
        }
      }
    });

    if (!logResult.success) {
      logWhatsAppStage("message_persist_failed", {
        phone: storagePhone || inboundWithIdentity.phone,
        providerMessageId: inbound.providerMessageId,
        level: "error",
        error: logResult.error?.message || "unknown"
      });
      return {
        success: false,
        error: "MESSAGE_PERSIST_FAILED"
      };
    }

    logWhatsAppStage("contact_logged_not_promoted", {
      phone: storagePhone || inboundWithIdentity.phone,
      organizationId: organizationId || claimedOrganizationId || null,
      reason: promotionDeniedReason || "NO_VALID_PROMOTION_SIGNAL",
      conversationLogId: logResult.log?.id || null
    });

    try {
      await maybeCreateUnsupportedInboundReview({
        inbound,
        organizationSource,
        organizationId: organizationId || claimedOrganizationId || null,
        prospect: null,
        campaignIntakeMatch: campaignIntakeMatch?.matched ? campaignIntakeMatch : intakeLookup,
        conversationLogId: logResult.log?.id || null,
        correlationId,
        qrAttributed: false,
        dependencies
      });
    } catch (reviewError) {
      logWhatsAppStage("unsupported_whatsapp_inbound_review_create_failed", {
        level: "warn",
        phone: storagePhone || inboundWithIdentity.phone,
        providerMessageId: inbound.providerMessageId,
        error: reviewError.message
      });
    }

    return {
      success: true,
      skipped: false,
      created: false,
      contactOnly: true,
      reason: promotionDeniedReason || "CONTACT_NOT_PROMOTED",
      phone: storagePhone || inboundWithIdentity.phone,
      conversationLogId: logResult.log?.id || null,
      correlationId,
      conversation: {
        success: true,
        replied: false,
        reason: "ATLAS_AUTOMATION_NOT_ELIGIBLE"
      },
      organizationId: organizationId || claimedOrganizationId || null,
      prospectId: null,
      ownerUserId: null
    };
  }

  if (campaignIntakeMatch?.matched) {
    const workflowState = prospect?.phone
      ? await loadPersistedWorkflowState(prospect.phone, {
          organizationId: organizationId || prospect.organization_id || null,
          prospectId: prospect.id || null
        }).catch(() => null)
      : null;

    const attributionResult = await intakeService.establishInboundAttribution({
      match: campaignIntakeMatch,
      prospect,
      created,
      workflowState,
      providerMessageId: inbound.providerMessageId || null,
      phoneNumberId,
      organizationId: organizationId || claimedOrganizationId
    });

    if (
      attributionResult?.ok &&
      (attributionResult.recruitingEligible || attributionResult.iulReviewEligible)
    ) {
      await markPendingReviewsRecoveredAutomatically({
        prospect,
        organizationId: organizationId || claimedOrganizationId || null,
        campaignCode: campaignIntakeMatch.code || null
      }).catch((recoveryError) => {
        logWhatsAppStage("unsupported_whatsapp_inbound_review_auto_recover_failed", {
          level: "warn",
          phone: prospect?.phone || null,
          error: recoveryError.message
        });
      });
    }
  }

  const semanticBody = campaignIntakeMatch?.matched
    ? stripCampaignIntakeToken(body, campaignIntakeMatch.code)
    : body;
  const inboundForAutomation = {
    ...inbound,
    body: semanticBody,
    campaignIntakeMatch: campaignIntakeMatch?.matched ? campaignIntakeMatch : null,
    whatsappConnectionSource: organizationSource,
    whatsappConnectionOwnerUserId: claimedOwnerUserId
  };

  logWhatsAppStage("inbound_prospect_ready", {
    phone: storagePhone,
    created,
    organizationId: organizationId || prospect?.organization_id || null
  });

  const logResult = await persistInboundLog({
    phone: storagePhone,
    name: prospect.name || inbound.contactName,
    direction: "incoming",
    message: body,
    intent: "WHATSAPP_INBOUND",
    pipeline: prospect.current_step || "NEW",
    currentStep: prospect.current_step || "NEW",
    organizationId: organizationId || prospect.organization_id || claimedOrganizationId || null,
    language: resolveProspectCommunicationCode(prospect),
    city: prospect.city || null,
    state: prospect.state || null,
    eventCorrelationId: correlationId,
    providerMessageId: inbound.providerMessageId,
    rawWebhookPayload: {
      message: inbound.rawMessage,
      valueMetadata: {
        messaging_product: inbound.rawValue?.messaging_product || "whatsapp",
        metadata: inbound.rawValue?.metadata || null
      }
    }
  });

  if (!logResult.success) {
    logWhatsAppStage("message_persist_failed", {
      phone: storagePhone,
      providerMessageId: inbound.providerMessageId,
      level: "error",
      error: logResult.error?.message || "unknown"
    });

    return {
      success: false,
      error: "MESSAGE_PERSIST_FAILED"
    };
  }

  logWhatsAppStage("message_persisted", {
    phone: storagePhone,
    providerMessageId: inbound.providerMessageId,
    conversationLogId: logResult.log?.id || null
  });

  try {
    const reactivate =
      dependencies.reactivateWindowExpiredConversation ||
      require("./conversationsCenter/conversationWindowInboxEngine")
        .reactivateWindowExpiredConversation;
    await reactivate({
      phone: storagePhone,
      organizationId: organizationId || prospect?.organization_id || claimedOrganizationId || null,
      prospectId: prospect?.id || null
    });
  } catch (reactivateError) {
    logWhatsAppStage("conversation_window_reactivate_failed", {
      level: "warn",
      phone: storagePhone,
      error: reactivateError.message
    });
  }

  try {
    await maybeCreateUnsupportedInboundReview({
      inbound,
      organizationSource,
      organizationId: organizationId || claimedOrganizationId || null,
      prospect,
      campaignIntakeMatch: campaignIntakeMatch?.matched ? campaignIntakeMatch : intakeLookup,
      conversationLogId: logResult.log?.id || null,
      correlationId,
      qrAttributed: Boolean(qrAttribution?.matched),
      dependencies
    });
  } catch (reviewError) {
    logWhatsAppStage("unsupported_whatsapp_inbound_review_create_failed", {
      level: "warn",
      phone: storagePhone,
      providerMessageId: inbound.providerMessageId,
      error: reviewError.message
    });
  }

  // BR-140 — persist structured audio metadata immediately; fetch bytes asynchronously.
  // Must not block webhook completion or change ownership / BR-080 / qualification.
  const isAudioInbound = String(inbound.messageType || "").toLowerCase() === "audio";
  try {
    const persistMedia =
      dependencies.persistInboundAudioMedia ||
      require("./communicationMedia/whatsappMediaFetchService").persistInboundAudioMedia;
    await persistMedia({
      organizationId: organizationId || prospect?.organization_id || claimedOrganizationId || null,
      prospectId: prospect?.id || null,
      conversationLogId: logResult.log?.id || null,
      inbound,
      repository: dependencies.communicationMediaRepository || null
    });
  } catch (mediaError) {
    logWhatsAppStage("communication_media_persist_failed", {
      level: "warn",
      phone: storagePhone,
      providerMessageId: inbound.providerMessageId,
      error: mediaError?.publicCode || mediaError?.message || "unknown"
    });
  }

  if (isAudioInbound) {
    const schedule =
      dependencies.scheduleMediaProcessing ||
      ((work) => {
        setImmediate(() => {
          Promise.resolve(work()).catch((error) => {
            logWhatsAppStage("communication_media_background_failed", {
              level: "warn",
              phone: storagePhone,
              providerMessageId: inbound.providerMessageId,
              error: error?.publicCode || error?.message || "unknown"
            });
          });
        });
      });
    schedule(() => {
      const {
        processPendingWhatsAppMediaFetches
      } = require("./communicationMedia/whatsappMediaFetchService");
      return processPendingWhatsAppMediaFetches({
        repository: dependencies.communicationMediaRepository || undefined,
        ...(dependencies.mediaProcessingDependencies || {})
      });
    });
  }

  try {
    const { reconcileStallAfterProspectReply } = require("./workflowReadModel");
    await reconcileStallAfterProspectReply(prospect);
  } catch (stallError) {
    logWhatsAppStage("br034_inbound_stall_reconcile_failed", {
      level: "warn",
      phone: storagePhone,
      error: stallError.message
    });
  }

  await recruitingWorkflowHooks
    .onMessageReceived({
      phone: storagePhone,
      message: body,
      organizationId: organizationId || prospect?.organization_id || null
    })
    .catch((error) => {
      console.warn("[whatsappInboundPipeline] recruiting workflow hook failed:", error.message);
    });

  logWhatsAppStage("event_emitted", {
    phone: storagePhone,
    providerMessageId: inbound.providerMessageId,
    eventType: "MessageReceived"
  });

  logWhatsAppStage("read_models_refresh_ready", {
    phone: storagePhone,
    created
  });

  let conversation = null;

  const scheduleBurst =
    dependencies.scheduleInboundBurstAggregation ||
    require("./whatsappInboundBurstAggregator").scheduleInboundBurstAggregation;
  const hasDeliveredAutomatedOutbound =
    dependencies.prospectHasDeliveredAutomatedOutbound ||
    prospectHasDeliveredAutomatedOutbound;
  const recruitingFirstTurnBurst = isRecruitingCampaignIntakeFirstTurnBurst({
    campaignIntakeMatch: campaignIntakeMatch?.matched ? campaignIntakeMatch : null,
    hasDeliveredAutomatedOutbound: await hasDeliveredAutomatedOutbound(
      storagePhone,
      organizationId || prospect?.organization_id || claimedOrganizationId || null
    )
  });

  let automationInbound = inboundForAutomation;
  if (!isAudioInbound) {
    const burstResult = await scheduleBurst({
      phone: storagePhone,
      text: semanticBody,
      inbound: inboundForAutomation,
      waitMs: dependencies.inboundBurstWaitMs,
      recruitingFirstTurnBurst
    });
    automationInbound = burstResult.inbound;
    if (burstResult.burst) {
      logWhatsAppStage("inbound_burst_aggregated", {
        phone: storagePhone,
        fragmentCount: burstResult.inbound.burstFragmentCount || 2,
        anchorProviderMessageId: burstResult.anchorProviderMessageId || null,
        recruitingFirstTurnBurst: Boolean(burstResult.inbound.recruitingFirstTurnBurst)
      });
      if (
        burstResult.anchorProviderMessageId &&
        burstResult.anchorProviderMessageId !== providerMessageId
      ) {
        return {
          success: true,
          skipped: false,
          reason: "BURST_AGGREGATED_DEFERRED",
          phone: storagePhone,
          correlationId,
          conversationLogId: logResult.log?.id || null
        };
      }
    }
  }

  if (!isAudioInbound) {
    const workflowState = prospect?.phone
      ? await loadPersistedWorkflowState(prospect.phone, {
          organizationId: organizationId || prospect.organization_id || null,
          prospectId: prospect.id || null
        }).catch(() => null)
      : null;
    const skipDuplicateFirstTurn = shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: automationInbound.campaignIntakeMatch,
      hasDeliveredAutomatedOutbound: await hasDeliveredAutomatedOutbound(
        storagePhone,
        organizationId || prospect?.organization_id || claimedOrganizationId || null
      ),
      workflowState,
      semanticBody: automationInbound.body || semanticBody
    });
    if (skipDuplicateFirstTurn) {
      logWhatsAppStage("recruiting_first_turn_burst_dedup_skipped", {
        phone: storagePhone,
        providerMessageId: inbound.providerMessageId,
        recruitingFirstTurnBurst
      });
      return {
        success: true,
        skipped: false,
        reason: "RECRUITING_FIRST_TURN_BURST_DEDUP_SKIPPED",
        phone: storagePhone,
        correlationId,
        conversationLogId: logResult.log?.id || null
      };
    }
  }

  try {
    conversation = await runHub({
      inbound: automationInbound,
      storagePhone,
      prospect,
      contactName: prospect.name || inbound.contactName,
      qrAttributed: Boolean(qrAttribution?.matched)
    });
  } catch (error) {
    logWhatsAppStage("conversation_engine_failed", {
      phone: storagePhone,
      providerMessageId: inbound.providerMessageId,
      level: "error",
      error: error.message
    });

    conversation = {
      success: false,
      replied: false,
      reason: "CONVERSATION_ENGINE_ERROR",
      error: error.message
    };
  }

  // Implements BR-080 — only mark AI responding after a real outbound delivery.
  await applyInboundAttentionUpdate(prospect, conversation);

  // Implements BR-081 Phase 3B — post-live advisory:
  // continuous context capture (flag-gated, target 100%) + shadow eval (10%).
  // Live CE / WhatsApp / appointments / BR-080 remain authoritative. Failures never interrupt.
  // Ordering: post-live CE + BR-080 snapshot (canonical production state).
  // BR-141 — audio inbound is not semantic text; advisory runs after STT replay instead.
  if (!isAudioInbound && conversation?.reason !== "ATLAS_AUTOMATION_NOT_ELIGIBLE") {
    try {
      const {
        scheduleRecruitAiV2PostLiveAdvisory
      } = require("./recruitAiV2/advisoryTurnRunner");

      scheduleRecruitAiV2PostLiveAdvisory({
        prospect,
        organizationId: organizationId || prospect?.organization_id || null,
        inbound,
        storagePhone,
        conversation,
        inboundMessageId: inbound.providerMessageId || null,
        messageText: semanticBody,
        channel: "whatsapp"
      });
    } catch (advisoryError) {
      logWhatsAppStage("recruit_ai_v2_advisory_schedule_failed", {
        level: "warn",
        phone: storagePhone,
        error: advisoryError.message
      });
    }
  }

  return {
    success: true,
    skipped: false,
    phone: storagePhone,
    created,
    conversationLogId: logResult.log?.id || null,
    correlationId,
    conversation,
    organizationId: organizationId || prospect?.organization_id || claimedOrganizationId || null,
    prospectId: prospect?.id || null,
    ownerUserId: prospect?.owner_user_id || null
  };
}

module.exports = {
  processInboundWhatsAppMessage,
  buildInboundCorrelationId,
  setCampaignIntakeAttributionServiceForTests,
  conversationDeliveredReply,
  attemptStalledFirstReplyRecovery,
  prospectHasAutomatedOutboundReply,
  buildStalledFirstReplyRecoveryContext,
  restoreStalledFirstReplyRecruitingState
};