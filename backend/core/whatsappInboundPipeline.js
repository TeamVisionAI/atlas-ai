/**
 * Sprint 11.1 — Inbound WhatsApp message pipeline.
 * Webhook → prospect resolve → persist → event engine. No AI replies in 11.1.
 */

const { findWorkflowEventByCorrelationId } = require("../services/workflowEventService");
const { logConversation } = require("../services/logService");
const { locateOrCreateWhatsAppProspect } = require("./whatsappProspectResolver");
const { WHATSAPP_CORRELATION_PREFIX } = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

function buildInboundCorrelationId(providerMessageId) {
  return `${WHATSAPP_CORRELATION_PREFIX.INBOUND}${providerMessageId}`;
}

/**
 * @param {Object} inbound — normalized message from whatsappWebhookParser
 */
async function processInboundWhatsAppMessage(inbound) {
  const correlationId = buildInboundCorrelationId(inbound.providerMessageId);
  const existing = await findWorkflowEventByCorrelationId(correlationId);

  if (existing) {
    logWhatsAppStage("message_duplicate_skipped", {
      providerMessageId: inbound.providerMessageId,
      phone: inbound.phone
    });

    return {
      success: true,
      skipped: true,
      reason: "DUPLICATE_PROVIDER_MESSAGE",
      correlationId
    };
  }

  const body = inbound.body || `[${inbound.messageType} message]`;

  const { prospect, created, storagePhone } = await locateOrCreateWhatsAppProspect({
    phone: inbound.phone,
    name: inbound.contactName,
    firstMessage: body,
    correlationBase: correlationId
  });

  const logResult = await logConversation({
    phone: storagePhone,
    name: prospect.name || inbound.contactName,
    direction: "incoming",
    message: body,
    intent: "WHATSAPP_INBOUND",
    pipeline: prospect.current_step || "NEW",
    currentStep: prospect.current_step || "NEW",
    language: prospect.language || prospect.communication_language || "es",
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

  logWhatsAppStage("event_emitted", {
    phone: storagePhone,
    providerMessageId: inbound.providerMessageId,
    eventType: "MessageReceived"
  });

  logWhatsAppStage("read_models_refresh_ready", {
    phone: storagePhone,
    created
  });

  return {
    success: true,
    skipped: false,
    phone: storagePhone,
    created,
    conversationLogId: logResult.log?.id || null,
    correlationId
  };
}

module.exports = {
  processInboundWhatsAppMessage,
  buildInboundCorrelationId
};
