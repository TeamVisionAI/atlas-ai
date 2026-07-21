/**
 * Journey #6 — WhatsApp Cloud API channel adapter (simulated normalization).
 */

const { ChannelAdapter } = require("../ChannelAdapter");
const { createMessageEnvelope } = require("../MessageEnvelope");

const CHANNEL_ID = "whatsapp";

function whatsappTimestampToIso(timestamp) {
  const numeric = Number(timestamp);

  if (Number.isNaN(numeric)) {
    return new Date().toISOString();
  }

  const millis = numeric < 1e12 ? numeric * 1000 : numeric;
  return new Date(millis).toISOString();
}

class WhatsAppAdapter extends ChannelAdapter {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL_ID });
  }

  receive(rawPayload) {
    const body = rawPayload || {};

    if (body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) {
      throw new Error("Invalid WhatsApp webhook payload");
    }

    for (const entry of body.entry) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change.value || {};
        const messages = Array.isArray(value.messages) ? value.messages : [];

        for (const message of messages) {
          if (message.type === "text" && message.text?.body) {
            return {
              messageId: message.id,
              senderId: message.from,
              recipientId: value.metadata?.phone_number_id || "",
              timestamp: whatsappTimestampToIso(message.timestamp),
              text: message.text.body,
              attachments: [],
              replyTo: message.context?.id || null
            };
          }
        }
      }
    }

    throw new Error("WhatsApp payload contained no text messages");
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
      providerMessageId: outbound.providerMessageId || `mock.whatsapp.${Date.now()}`,
      recipientId: outbound.recipientId,
      text: outbound.text
    };
  }
}

module.exports = {
  WhatsAppAdapter,
  CHANNEL_ID
};
