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
const whatsappProspectResolver = require("./whatsappProspectResolver");
const {
  resolveWhatsAppInboundOrganizationId
} = require("./whatsappInboundOrganizationResolver");
const { buildInboundCorrelationId } = require("./whatsappInboundClaim");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { processConversationAfterInbound } = require("./communicationHub");
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

  const { prospect, created, storagePhone, organizationId } =
    await locateOrCreate({
      phone: inbound.phone,
      name: inbound.contactName,
      firstMessage: body,
      correlationBase: correlationId,
      phoneNumberId: inbound.phoneNumberId || inbound.rawValue?.metadata?.phone_number_id || null,
      wabaId: inbound.wabaId || null,
      providerMessageId: inbound.providerMessageId || null
    });

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
      message: body
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
      inbound,
      storagePhone,
      prospect,
      contactName: prospect.name || inbound.contactName
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

  // Implements BR-080 — AI success does not acknowledge; failures raise human attention.
  try {
    const {
      markAiResponding,
      markHumanAttentionRequired
    } = require("./newLeadAttentionEngine");

    if (conversation?.success && conversation?.replied) {
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
      phone: storagePhone,
      error: attentionError.message
    });
  }

  // Implements BR-081 Phase 3B — post-live advisory:
  // continuous context capture (flag-gated, target 100%) + shadow eval (10%).
  // Live CE / WhatsApp / appointments / BR-080 remain authoritative. Failures never interrupt.
  // Ordering: post-live CE + BR-080 snapshot (canonical production state).
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
      messageText: body,
      channel: "whatsapp"
    });
  } catch (advisoryError) {
    logWhatsAppStage("recruit_ai_v2_advisory_schedule_failed", {
      level: "warn",
      phone: storagePhone,
      error: advisoryError.message
    });
  }

  return {
    success: true,
    skipped: false,
    phone: storagePhone,
    created,
    conversationLogId: logResult.log?.id || null,
    correlationId,
    conversation
  };
}

module.exports = {
  processInboundWhatsAppMessage,
  buildInboundCorrelationId
};
