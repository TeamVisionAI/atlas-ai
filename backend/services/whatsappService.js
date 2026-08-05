const { sendAndPersistWhatsAppMessage } = require("../core/whatsappOutboundPipeline");
const { normalizePhoneNumber } = require("../core/phoneNormalizer");

/**
 * Sprint 11.1 / BR-075 — WhatsApp send entry point.
 * All outbound messages authorize + persist through the outbound pipeline gate.
 */
async function sendTextMessage(to, message, options = {}) {
  const metaTo = normalizePhoneNumber(to) || String(to || "").replace(/\D/g, "");

  return sendAndPersistWhatsAppMessage({
    to: metaTo,
    message,
    actor: options.actor || (options.intent === "AGENT_ACTION" ? "AGENT" : "ATLAS"),
    intent: options.intent || "WHATSAPP_OUTBOUND",
    organizationId: options.organizationId || null,
    templateKey: options.templateKey || null,
    templateVariables: options.templateVariables || {},
    callerMetaTemplateName: options.metaTemplateName || options.callerMetaTemplateName || null,
    idempotencyKey: options.idempotencyKey || null,
    now: options.now
  });
}

module.exports = {
  sendTextMessage
};
