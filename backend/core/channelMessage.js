/**
 * Sprint 11.4 — Channel-agnostic normalized message envelope.
 * Adapters (WhatsApp, simulator, future channels) map provider payloads here.
 */

/**
 * @typedef {Object} NormalizedChannelMessage
 * @property {string} channel — e.g. whatsapp, simulator
 * @property {string} providerMessageId — idempotent provider id
 * @property {string} phone — storage-normalized prospect phone
 * @property {string|null} contactName
 * @property {string} text — message body for Conversation Engine
 * @property {string} messageType — text, button, interactive, audio, etc.
 * @property {object|null} media — structured inbound media metadata (no tokens)
 * @property {string} timestamp — ISO-8601
 */

/**
 * @param {Object} inbound — normalized WhatsApp message from whatsappWebhookParser
 * @param {string} storagePhone — E.164 storage key from whatsappProspectResolver
 * @returns {NormalizedChannelMessage}
 */
function buildNormalizedMessageFromWhatsApp(inbound, storagePhone) {
  return {
    channel: "whatsapp",
    providerMessageId: inbound.providerMessageId,
    phone: storagePhone,
    contactName: inbound.contactName || null,
    text: String(inbound.body || "").trim(),
    messageType: inbound.messageType || "text",
    media: inbound.media || null,
    timestamp: inbound.timestamp || new Date().toISOString(),
    phoneNumberId:
      inbound.phoneNumberId || inbound.rawValue?.metadata?.phone_number_id || null,
    wabaId: inbound.wabaId || null,
    ctwaReferral: inbound.ctwaReferral || null,
    campaignIntakeMatch: inbound.campaignIntakeMatch || null,
    interactiveReply: inbound.interactiveReply || null,
    whatsappConnectionSource: inbound.whatsappConnectionSource || null,
    whatsappConnectionOwnerUserId: inbound.whatsappConnectionOwnerUserId || null
  };
}

module.exports = {
  buildNormalizedMessageFromWhatsApp
};
