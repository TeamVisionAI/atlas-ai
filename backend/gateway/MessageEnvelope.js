/**
 * Journey #6 — Permanent internal message contract.
 * Channel adapters normalize into this envelope; only this shape reaches the Agent bridge.
 */

const crypto = require("crypto");

/** Neutral transport identifier — Agent never receives platform channel keys. */
const AGENT_TRANSPORT = "atlas";

const ENVELOPE_FIELDS = Object.freeze([
  "messageId",
  "channel",
  "organizationId",
  "prospectId",
  "conversationId",
  "timestamp",
  "text",
  "attachments",
  "language",
  "metadata",
  "replyTo",
  "deliveryContext"
]);

/**
 * @param {Object} partial
 * @returns {Object}
 */
function createMessageEnvelope(partial) {
  if (!partial?.channel) {
    throw new Error("MessageEnvelope requires channel");
  }

  return {
    messageId: partial.messageId || crypto.randomUUID(),
    channel: partial.channel,
    organizationId: partial.organizationId || null,
    prospectId: partial.prospectId || null,
    conversationId: partial.conversationId || null,
    timestamp: partial.timestamp || new Date().toISOString(),
    text: partial.text || "",
    attachments: Array.isArray(partial.attachments) ? partial.attachments : [],
    language: partial.language || "en",
    metadata: partial.metadata && typeof partial.metadata === "object" ? partial.metadata : {},
    replyTo: partial.replyTo || null,
    deliveryContext:
      partial.deliveryContext && typeof partial.deliveryContext === "object"
        ? partial.deliveryContext
        : {}
  };
}

/**
 * Compare envelope structure (ignores values that vary by channel/message).
 * @param {Object} envelope
 * @returns {string[]}
 */
function envelopeStructureKeys(envelope) {
  return ENVELOPE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(envelope, field));
}

/**
 * Map envelope to Agent runtime input — strips platform channel identity.
 * @param {Object} envelope
 * @param {Object} [context]
 * @returns {Object}
 */
function toAgentInput(envelope, context = {}) {
  return {
    text: envelope.text,
    messageId: envelope.messageId,
    channel: AGENT_TRANSPORT,
    conversationId: envelope.conversationId || null,
    prospect: {
      id: envelope.prospectId,
      displayName: context.prospectDisplayName || "Prospect"
    },
    organization: context.organization || null,
    workflowName: context.workflowName || null,
    language: envelope.language,
    timestamp: envelope.timestamp
  };
}

module.exports = {
  AGENT_TRANSPORT,
  ENVELOPE_FIELDS,
  createMessageEnvelope,
  envelopeStructureKeys,
  toAgentInput
};
