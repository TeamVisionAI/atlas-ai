/**
 * Sprint 12.0.1 — Messenger channel constants.
 */

const MESSENGER_CORRELATION_PREFIX = Object.freeze({
  INBOUND: "messenger:inbound:",
  OUTBOUND: "messenger:outbound:"
});

const MESSENGER_STORAGE_PREFIX = "messenger:";

const MESSENGER_SOURCE = Object.freeze({
  FACEBOOK: "FACEBOOK"
});

const MESSENGER_ENTRY_METHOD = Object.freeze({
  MESSENGER_DM: "MESSENGER_DM"
});

function buildMessengerStorageKey(psid) {
  return `${MESSENGER_STORAGE_PREFIX}${String(psid || "").trim()}`;
}

function buildMessengerInboundCorrelationId(providerMessageId) {
  return `${MESSENGER_CORRELATION_PREFIX.INBOUND}${providerMessageId}`;
}

function buildMessengerOutboundCorrelationId(providerMessageId) {
  return `${MESSENGER_CORRELATION_PREFIX.OUTBOUND}${providerMessageId}`;
}

module.exports = {
  MESSENGER_CORRELATION_PREFIX,
  MESSENGER_STORAGE_PREFIX,
  MESSENGER_SOURCE,
  MESSENGER_ENTRY_METHOD,
  buildMessengerStorageKey,
  buildMessengerInboundCorrelationId,
  buildMessengerOutboundCorrelationId
};
