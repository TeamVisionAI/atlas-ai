/**
 * Sprint 21.0 — Simulated WhatsApp inbound pipeline for Meta App Review.
 * Mirrors production whatsappInboundPipeline hooks while preserving sim- phone isolation.
 * External WhatsApp delivery is blocked by withSimulatorGuard (shouldMockExternalComms).
 */

const crypto = require("crypto");
const { findProspect } = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const { claimWhatsAppInboundCorrelation } = require("../services/workflowEventService");
const {
  buildInboundCorrelationId
} = require("../core/whatsappInboundPipeline");
const { assertSimulatorPhone } = require("./simulatorSafety");
const { withSimulatorGuard } = require("./simulatorGuard");
const { resolveProspectCommunicationCode } = require("../core/prospectLanguage");
const { onMessageReceived } = require("../core/recruitingWorkflowHooks");
const { processConversationAfterInbound } = require("../core/communicationHub");
const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");

function buildSimulatedWhatsAppInbound({
  phone,
  body,
  contactName = null,
  providerMessageId = null
}) {
  const messageId = providerMessageId || `sim-wa-${crypto.randomUUID()}`;
  const text = String(body || "").trim();

  return {
    phone,
    contactName: contactName || "Simulator Prospect",
    body: text,
    messageType: "text",
    timestamp: new Date().toISOString(),
    providerMessageId: messageId,
    rawMessage: {
      simulated: true,
      type: "text",
      text: { body: text }
    },
    rawValue: {
      messaging_product: "whatsapp",
      metadata: {
        display_phone_number: "simulated",
        phone_number_id: "simulated",
        simulated_for: "app_review"
      }
    }
  };
}

/**
 * Production-equivalent inbound processing for simulator phones.
 * Keeps storage phone as the sim- identifier (no E.164 normalization).
 */
async function processSimulatedWhatsAppInbound(payload = {}) {
  const phone = payload.phone;
  assertSimulatorPhone(phone);

  return withSimulatorGuard(async () => {
    const trace = [];
    const pushTrace = (step, status, detail = null) => {
      trace.push({
        step,
        status,
        timestamp: new Date().toISOString(),
        detail
      });
    };

    const prospect = await findProspect(phone);

    if (!prospect) {
      pushTrace("prospect_resolved", "failed", "Simulator prospect not found");
      const error = new Error("Simulator prospect not found.");
      error.code = "PROSPECT_NOT_FOUND";
      throw error;
    }

    pushTrace("prospect_resolved", "complete", prospect.name || phone);

    const inbound = buildSimulatedWhatsAppInbound({
      phone,
      body: payload.body,
      contactName: payload.contactName || prospect.name,
      providerMessageId: payload.providerMessageId
    });

    const correlationId = buildInboundCorrelationId(inbound.providerMessageId);
    const claim = await claimWhatsAppInboundCorrelation({
      correlationId,
      providerMessageId: inbound.providerMessageId,
      prospectPhone: phone,
      organizationId: prospect.organization_id || null
    });

    if (!claim.claimed) {
      pushTrace("inbound_dedup", "skipped", correlationId);
      return {
        success: true,
        skipped: true,
        reason: "DUPLICATE_PROVIDER_MESSAGE",
        phone,
        correlationId,
        trace
      };
    }

    const body = inbound.body || `[${inbound.messageType} message]`;
    const storagePhone = phone;

    const logResult = await logConversation({
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
        simulated: true,
        message: inbound.rawMessage,
        valueMetadata: {
          messaging_product: inbound.rawValue?.messaging_product || "whatsapp",
          metadata: inbound.rawValue?.metadata || null
        }
      }
    });

    if (!logResult.success) {
      pushTrace("inbound_persisted", "failed", logResult.error?.message || "unknown");
      return {
        success: false,
        error: "MESSAGE_PERSIST_FAILED",
        phone,
        trace
      };
    }

    pushTrace("inbound_persisted", "complete", logResult.log?.id || null);

    await onMessageReceived({
      phone: storagePhone,
      message: body
    }).catch((error) => {
      console.warn("[simulatedWhatsAppInboundPipeline] onMessageReceived failed:", error.message);
    });

    pushTrace("message_received_hook", "complete");

    let conversation = null;

    try {
      conversation = await processConversationAfterInbound({
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

      pushTrace("conversation_engine", "failed", error.message);

      conversation = {
        success: false,
        replied: false,
        reason: "CONVERSATION_ENGINE_ERROR",
        error: error.message
      };
    }

    if (conversation?.success !== false) {
      pushTrace("conversation_engine", "complete", conversation?.reason || "processed");
    }

    if (conversation?.replyText) {
      pushTrace("reply_generated", "complete", conversation.replyText.slice(0, 120));
    } else if (conversation?.replied === false) {
      pushTrace("reply_generated", "skipped", conversation?.reason || "no_reply");
    }

    if (conversation?.delivery?.simulated || conversation?.delivery?.success) {
      pushTrace("outbound_persisted", "complete", conversation.delivery?.simulated ? "local_only" : "sent");
    } else if (conversation?.replyText) {
      pushTrace("outbound_persisted", "complete", "local_only");
    }

    const updatedProspect = await findProspect(storagePhone);
    pushTrace("prospect_updated", "complete", updatedProspect?.current_step || null);
    pushTrace("recommendation_ready", "complete");

    return {
      success: true,
      skipped: false,
      phone: storagePhone,
      created: false,
      conversationLogId: logResult.log?.id || null,
      correlationId,
      conversation,
      reply: conversation?.replyText || null,
      trace
    };
  });
}

module.exports = {
  buildSimulatedWhatsAppInbound,
  processSimulatedWhatsAppInbound
};
