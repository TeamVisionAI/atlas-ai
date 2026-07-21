/**
 * Sprint 12.1 — Parse Facebook Messenger webhook payloads (connector-internal).
 */

const { CHANNEL } = require("../../models/Channel");
const { GatewayMessage } = require("../../models/GatewayMessage");
const { MessageDirection } = require("../../constants/MessageDirection");
const { MessageType } = require("../../constants/MessageType");

function messengerTimestampToIso(timestamp) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const numeric = Number(timestamp);

  if (Number.isNaN(numeric)) {
    return new Date().toISOString();
  }

  const millis = numeric < 1e12 ? numeric * 1000 : numeric;
  return new Date(millis).toISOString();
}

function mapAttachmentType(type) {
  const normalized = String(type || "").toLowerCase();

  if (normalized === "image") {
    return MessageType.IMAGE;
  }

  if (normalized === "audio") {
    return MessageType.AUDIO;
  }

  if (normalized === "video") {
    return MessageType.VIDEO;
  }

  if (normalized === "file") {
    return MessageType.FILE;
  }

  if (normalized === "location") {
    return MessageType.LOCATION;
  }

  return MessageType.UNKNOWN;
}

function buildMessageFromMessagingEvent(messagingEvent) {
  if (!messagingEvent?.sender?.id) {
    return null;
  }

  if (messagingEvent.message) {
    const message = messagingEvent.message;
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.map((attachment) => ({
          type: attachment.type || MessageType.UNKNOWN,
          payload: attachment.payload || {}
        }))
      : [];

    const primaryType =
      attachments.length > 0
        ? mapAttachmentType(attachments[0].type)
        : MessageType.TEXT;

    return new GatewayMessage({
      id: message.mid || null,
      channel: CHANNEL.MESSENGER,
      senderId: messagingEvent.sender.id,
      recipientId: messagingEvent.recipient?.id || "",
      timestamp: messengerTimestampToIso(messagingEvent.timestamp),
      type: primaryType,
      text: message.text || "",
      attachments,
      direction: MessageDirection.INBOUND,
      metadata: {
        provider: CHANNEL.MESSENGER,
        rawMessage: {
          mid: message.mid || null,
          seq: message.seq ?? null
        }
      }
    });
  }

  if (messagingEvent.postback) {
    return new GatewayMessage({
      id: messagingEvent.postback.mid || null,
      channel: CHANNEL.MESSENGER,
      senderId: messagingEvent.sender.id,
      recipientId: messagingEvent.recipient?.id || "",
      timestamp: messengerTimestampToIso(messagingEvent.timestamp),
      type: MessageType.POSTBACK,
      text: messagingEvent.postback.title || messagingEvent.postback.payload || "",
      attachments: [],
      direction: MessageDirection.INBOUND,
      metadata: {
        provider: CHANNEL.MESSENGER,
        postback: {
          payload: messagingEvent.postback.payload || null,
          title: messagingEvent.postback.title || null
        }
      }
    });
  }

  return null;
}

/**
 * @param {unknown} providerPayload
 * @returns {GatewayMessage[]}
 */
function parseMessengerWebhook(providerPayload) {
  const body = providerPayload || {};
  const messages = [];

  if (body.object !== "page" || !Array.isArray(body.entry)) {
    return messages;
  }

  for (const entry of body.entry) {
    const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const messagingEvent of messagingEvents) {
      const normalized = buildMessageFromMessagingEvent(messagingEvent);

      if (normalized) {
        messages.push(normalized);
      }
    }
  }

  return messages;
}

module.exports = {
  parseMessengerWebhook
};
