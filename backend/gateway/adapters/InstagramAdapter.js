/**
 * Journey #6 — Instagram Direct Messages channel adapter.
 */

const { ChannelAdapter } = require("../ChannelAdapter");
const { createMessageEnvelope } = require("../MessageEnvelope");

const CHANNEL_ID = "instagram";

function instagramTimestampToIso(timestamp) {
  const numeric = Number(timestamp);
  const millis = Number.isNaN(numeric) ? Date.now() : numeric < 1e12 ? numeric * 1000 : numeric;
  return new Date(millis).toISOString();
}

class InstagramAdapter extends ChannelAdapter {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL_ID });
  }

  receive(rawPayload) {
    const body = rawPayload || {};

    if (body.object !== "instagram" || !Array.isArray(body.entry)) {
      throw new Error("Invalid Instagram webhook payload");
    }

    for (const entry of body.entry) {
      const events = Array.isArray(entry.messaging) ? entry.messaging : [];

      for (const event of events) {
        if (event.message?.text) {
          return {
            messageId: event.message.mid || null,
            senderId: event.sender?.id || "",
            recipientId: event.recipient?.id || "",
            timestamp: instagramTimestampToIso(event.timestamp),
            text: event.message.text,
            attachments: [],
            replyTo: event.message.reply_to?.mid || null
          };
        }
      }
    }

    throw new Error("Instagram payload contained no text messages");
  }

  normalize(parsed) {
    return createMessageEnvelope({
      messageId: parsed.messageId,
      channel: CHANNEL_ID,
      timestamp: parsed.timestamp,
      text: parsed.text,
      attachments: parsed.attachments || [],
      replyTo: parsed.replyTo,
      deliveryContext: {
        senderId: parsed.senderId,
        recipientId: parsed.recipientId
      },
      metadata: {
        provider: CHANNEL_ID,
        platformMessageId: parsed.messageId
      }
    });
  }

  async send(outbound) {
    return {
      success: true,
      channel: CHANNEL_ID,
      providerMessageId: outbound.providerMessageId || `mock.instagram.${Date.now()}`,
      recipientId: outbound.recipientId,
      text: outbound.text
    };
  }
}

module.exports = {
  InstagramAdapter,
  CHANNEL_ID
};
