const { sendAndPersistWhatsAppMessage } = require("../core/whatsappOutboundPipeline");
const { normalizePhoneNumber } = require("../core/phoneNormalizer");

/**
 * Sprint 11.1 — WhatsApp send entry point.
 * All outbound messages persist + emit through the outbound pipeline.
 */
async function sendTextMessage(to, message, options = {}) {
  const metaTo = normalizePhoneNumber(to) || String(to || "").replace(/\D/g, "");

  return sendAndPersistWhatsAppMessage({
    to: metaTo,
    message,
    actor: options.actor || (options.intent === "AGENT_ACTION" ? "AGENT" : "ATLAS"),
    intent: options.intent || "WHATSAPP_OUTBOUND"
  });
}

module.exports = {
  sendTextMessage
};
