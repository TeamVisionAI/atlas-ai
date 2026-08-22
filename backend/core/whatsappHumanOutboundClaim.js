/**
 * Idempotent claim for native WhatsApp Business app outbound echoes (smb_message_echoes).
 * Canonical key: whatsapp:human_echo:{providerMessageId}
 */

const { WHATSAPP_CORRELATION_PREFIX } = require("./whatsappConstants");

const HUMAN_ECHO_CLAIM_CORRELATION_RE = /^whatsapp:human_echo:[^:]+$/;

function buildHumanEchoCorrelationId(providerMessageId) {
  return `${WHATSAPP_CORRELATION_PREFIX.HUMAN_ECHO}${String(providerMessageId || "").trim()}`;
}

function isHumanEchoClaimCorrelationId(correlationId) {
  return HUMAN_ECHO_CLAIM_CORRELATION_RE.test(String(correlationId || ""));
}

module.exports = {
  HUMAN_ECHO_CLAIM_CORRELATION_RE,
  buildHumanEchoCorrelationId,
  isHumanEchoClaimCorrelationId
};
