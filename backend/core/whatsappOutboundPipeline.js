/**
 * Sprint 11.1 — Outbound WhatsApp message pipeline.
 * Send → persist → event engine (symmetric with inbound).
 */

const crypto = require("crypto");
const axios = require("axios");
const { shouldMockExternalComms } = require("../dev/simulatorGuard");
const { logConversation } = require("../services/logService");
const { findProspect } = require("../services/supabaseService");
const { normalizePhoneNumber } = require("./phoneNormalizer");
const { resolveStoragePhone } = require("./whatsappProspectResolver");
const { WHATSAPP_CORRELATION_PREFIX } = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

function buildOutboundCorrelationId(providerMessageId) {
  return `${WHATSAPP_CORRELATION_PREFIX.OUTBOUND}${providerMessageId}`;
}

async function sendAndPersistWhatsAppMessage({
  to,
  message,
  actor = "ATLAS",
  intent = "WHATSAPP_OUTBOUND"
}) {
  const text = String(message || "").trim();

  if (!to || !text) {
    return { success: false, error: "PHONE_AND_MESSAGE_REQUIRED" };
  }

  const metaTo = normalizePhoneNumber(to) || String(to || "").replace(/\D/g, "");
  const storagePhone = resolveStoragePhone(metaTo);
  const prospect =
    (await findProspect(storagePhone)) ||
    (await findProspect(to)) ||
    (await findProspect(`+${metaTo}`));
  const providerMessageId = crypto.randomUUID();
  const correlationId = buildOutboundCorrelationId(providerMessageId);

  let sendResult = { success: true, simulated: false, providerMessageId: null };

  if (shouldMockExternalComms()) {
    logWhatsAppStage("outbound_delivery_mocked", { to, preview: text.slice(0, 80) });
    sendResult = { success: true, simulated: true, providerMessageId: null };
  } else {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: metaTo,
          type: "text",
          text: { body: text }
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      sendResult = {
        success: true,
        simulated: false,
        providerMessageId: response.data?.messages?.[0]?.id || providerMessageId
      };

      logWhatsAppStage("outbound_delivery_sent", {
        to,
        providerMessageId: sendResult.providerMessageId
      });
    } catch (error) {
      logWhatsAppStage("outbound_delivery_failed", {
        to,
        level: "error",
        status: error.response?.status || null,
        error: error.response?.data?.error?.message || error.message
      });

      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  const outboundCorrelationId = sendResult.providerMessageId
    ? buildOutboundCorrelationId(sendResult.providerMessageId)
    : correlationId;

  const logResult = await logConversation({
    phone: prospect?.phone || storagePhone,
    name: prospect?.name || null,
    direction: "outgoing",
    message: text,
    intent,
    pipeline: prospect?.current_step || "NEW",
    currentStep: prospect?.current_step || "NEW",
    language: prospect?.language || prospect?.communication_language || "es",
    city: prospect?.city || null,
    state: prospect?.state || null,
    eventCorrelationId: outboundCorrelationId,
    providerMessageId: sendResult.providerMessageId || providerMessageId,
    actorOverride: actor
  });

  if (!logResult.success) {
    logWhatsAppStage("outbound_persist_failed", {
      to,
      level: "error",
      error: logResult.error?.message || "unknown"
    });
  } else {
    logWhatsAppStage("message_persisted", {
      phone: to,
      direction: "outgoing",
      conversationLogId: logResult.log?.id || null
    });
    logWhatsAppStage("event_emitted", {
      phone: to,
      eventType: "MessageSent"
    });
  }

  return {
    success: sendResult.success,
    simulated: sendResult.simulated,
    providerMessageId: sendResult.providerMessageId,
    conversationLogId: logResult.log?.id || null
  };
}

module.exports = {
  sendAndPersistWhatsAppMessage,
  buildOutboundCorrelationId
};
