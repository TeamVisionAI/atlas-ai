/**
 * Sprint 12.0.1 — Idempotent inbound message handling for channel webhooks.
 * Prevents duplicate provider deliveries from creating duplicate records.
 */

const crypto = require("crypto");

const { findWorkflowEventByCorrelationId } = require("../../services/workflowEventService");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");

/** @type {Set<string>} */
const seenKeys = new Set();

function buildDedupeKey(channel, providerMessageId) {
  return `${channel}:${providerMessageId}`;
}

/**
 * Resolve a stable provider message id for idempotency.
 * @param {import('../models/GatewayMessage').GatewayMessage} message
 */
function resolveProviderMessageId(message) {
  if (message?.id) {
    return String(message.id);
  }

  const fingerprint = [
    message?.channel || "",
    message?.senderId || "",
    message?.timestamp || "",
    message?.text || "",
    message?.type || ""
  ].join("|");

  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

/**
 * @param {string} channel
 * @param {string} providerMessageId
 * @param {string|null} [correlationId]
 */
async function isDuplicateInboundMessage(channel, providerMessageId, correlationId = null) {
  const dedupeKey = buildDedupeKey(channel, providerMessageId);

  if (seenKeys.has(dedupeKey)) {
    return true;
  }

  if (correlationId) {
    try {
      const existing = await findWorkflowEventByCorrelationId(correlationId);

      if (existing) {
        seenKeys.add(dedupeKey);
        return true;
      }
    } catch (error) {
      logCommunication(LOG_COMPONENTS.GATEWAY, "Idempotency lookup failed", {
        level: "warn",
        correlationId,
        error: error.message
      });
    }
  }

  return false;
}

/**
 * @param {string} channel
 * @param {string} providerMessageId
 */
function markInboundMessageProcessed(channel, providerMessageId) {
  seenKeys.add(buildDedupeKey(channel, providerMessageId));
}

function resetInboundMessageIdempotency() {
  seenKeys.clear();
}

module.exports = {
  resolveProviderMessageId,
  isDuplicateInboundMessage,
  markInboundMessageProcessed,
  resetInboundMessageIdempotency
};
