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
  findProspectInOrganization,
  supabase
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

function conversationDeliveredReply(conversation) {
  if (!conversation?.replied) {
    return false;
  }
  if (conversation.delivery && typeof conversation.delivery === "object") {
    return conversation.delivery.success === true;
  }
  return false;
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
  const storagePhone = resolveStoragePhone(phone);
  if (!storagePhone) {
    return false;
  }

  let query = supabase
    .from("conversation_logs")
    .select("id")
    .eq("prospect_phone", storagePhone)
    .eq("direction", "outgoing")
    .limit(1);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) {
    logWhatsAppStage("inbound_first_reply_recovery_lookup_failed", {
      level: "warn",
      phone: storagePhone,
      error: error.message
    });
    return true;
  }

  return Array.isArray(data) && data.length > 0;
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

  const body = inbound.body || `[${inbound.messageType} message]`;
  const phoneNumberId =
    inbound.phoneNumberId || inbound.rawValue?.metadata?.phone_number_id || null;
  const intakeLookup = await intakeService.lookupInboundMatch({
    organizationId: claimedOrganizationId,
    whatsappPhoneNumberId: phoneNumberId,
    messageBody: body
  });
  const semanticBody = intakeLookup?.matched
    ? stripCampaignIntakeToken(body, intakeLookup.code)
    : body;
  const inboundForAutomation = {
    ...inbound,
    body: semanticBody,
    campaignIntakeMatch: intakeLookup?.matched ? intakeLookup : null
  };

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
  const { organizationId: claimedOrganizationId } = await resolveOrg({
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

  const intakeService =
    dependencies.campaignIntakeAttributionService ||
    getCampaignIntakeAttributionService();

  let intakeLookup = await intakeService.lookupInboundMatch({
    organizationId: claimedOrganizationId,
    whatsappPhoneNumberId: phoneNumberId,
    messageBody: body
  });

  const { prospect, created, storagePhone, organizationId, qrAttribution, campaignIntakeMatch } =
    await locateOrCreate({
      phone: inbound.phone,
      name: inbound.contactName,
      firstMessage: body,
      correlationBase: correlationId,
      phoneNumberId,
      wabaId: inbound.wabaId || null,
      providerMessageId: inbound.providerMessageId || null,
      ctwaReferral: inbound.ctwaReferral || null,
      campaignIntakeMatch: intakeLookup?.matched ? intakeLookup : null
    });

  if (campaignIntakeMatch?.matched) {
    const workflowState = prospect?.phone
      ? await loadPersistedWorkflowState(prospect.phone, {
          organizationId: organizationId || prospect.organization_id || null,
          prospectId: prospect.id || null
        }).catch(() => null)
      : null;

    await intakeService.establishInboundAttribution({
      match: campaignIntakeMatch,
      prospect,
      created,
      workflowState,
      providerMessageId: inbound.providerMessageId || null,
      phoneNumberId,
      organizationId: organizationId || claimedOrganizationId
    });
  }

  const semanticBody = campaignIntakeMatch?.matched
    ? stripCampaignIntakeToken(body, campaignIntakeMatch.code)
    : body;
  const inboundForAutomation = {
    ...inbound,
    body: semanticBody,
    campaignIntakeMatch: campaignIntakeMatch?.matched ? campaignIntakeMatch : null
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

  try {
    conversation = await runHub({
      inbound: inboundForAutomation,
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
  prospectHasAutomatedOutboundReply
};
