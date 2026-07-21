/**
 * Sprint 12.0/12.1 — Normalized gateway message envelope.
 * Channel adapters map provider payloads here; no provider objects leave the connector.
 */

const { MessageDirection } = require("../constants/MessageDirection");
const { MessageType } = require("../constants/MessageType");

class GatewayMessage {
  /**
   * @param {Object} params
   * @param {string|null} [params.id]
   * @param {string|null} [params.conversationId]
   * @param {string} params.channel
   * @param {string} params.senderId
   * @param {string} params.recipientId
   * @param {string} [params.timestamp] — ISO-8601
   * @param {string} [params.type]
   * @param {string} [params.text]
   * @param {Array<Record<string, unknown>>} [params.attachments]
   * @param {string} [params.direction]
   * @param {Record<string, unknown>} [params.metadata]
   */
  constructor({
    id = null,
    conversationId = null,
    channel,
    senderId,
    recipientId,
    timestamp = new Date().toISOString(),
    type = MessageType.TEXT,
    text = "",
    attachments = [],
    direction = MessageDirection.INBOUND,
    metadata = {}
  }) {
    this.id = id;
    this.conversationId = conversationId;
    this.channel = channel;
    this.senderId = senderId;
    this.recipientId = recipientId;
    this.timestamp = timestamp;
    this.type = type;
    this.text = text;
    this.attachments = attachments;
    this.direction = direction;
    this.metadata = metadata;
  }
}

module.exports = {
  GatewayMessage
};
