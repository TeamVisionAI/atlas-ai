/**
 * Journey #6 — Facebook Messenger channel adapter.
 */

const { ChannelAdapter } = require("../ChannelAdapter");
const { createMessageEnvelope } = require("../MessageEnvelope");

const CHANNEL_ID = "messenger";

function messengerTimestampToIso(timestamp) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const numeric = Number(timestamp);
  const millis = Number.isNaN(numeric) ? Date.now() : numeric < 1e12 ? numeric * 1000 : numeric;
  return new Date(millis).toISOString();
}

function parseMessagingEvent(messagingEvent) {
  if (!messagingEvent?.sender?.id || !messagingEvent.message) {
    return null;
  }

  const message = messagingEvent.message;
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => ({
        type: attachment.type || "unknown",
        payload: attachment.payload || {}
      }))
    : [];

  return {
    messageId: message.mid || null,
    senderId: messagingEvent.sender.id,
    recipientId: messagingEvent.recipient?.id || "",
    timestamp: messengerTimestampToIso(messagingEvent.timestamp),
    text: message.text || "",
    attachments,
    replyTo: message.reply_to?.mid || null
  };
}

class MessengerAdapter extends ChannelAdapter {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL_ID });
  }

  receive(rawPayload) {
    const body = rawPayload || {};

    if (body.object !== "page" || !Array.isArray(body.entry)) {
      throw new Error("Invalid Messenger webhook payload");
    }

    const parsed = [];

    for (const entry of body.entry) {
      const events = Array.isArray(entry.messaging) ? entry.messaging : [];

      for (const event of events) {
        const message = parseMessagingEvent(event);

        if (message) {
          parsed.push(message);
        }
      }
    }

    if (parsed.length === 0) {
      throw new Error("Messenger payload contained no text messages");
    }

    return parsed;
  }

  normalize(parsed) {
    const message = Array.isArray(parsed) ? parsed[0] : parsed;

    return createMessageEnvelope({
      messageId: message.messageId,
      channel: CHANNEL_ID,
      timestamp: message.timestamp,
      text: message.text,
      attachments: message.attachments,
      replyTo: message.replyTo,
      deliveryContext: {
        senderId: message.senderId,
        recipientId: message.recipientId
      },
      metadata: {
        provider: CHANNEL_ID,
        platformMessageId: message.messageId
      }
    });
  }

  async send(outbound) {
    return {
      success: true,
      channel: CHANNEL_ID,
      providerMessageId: outbound.providerMessageId || `mock.messenger.${Date.now()}`,
      recipientId: outbound.recipientId,
      text: outbound.text
    };
  }
}

module.exports = {
  MessengerAdapter,
  CHANNEL_ID
};
