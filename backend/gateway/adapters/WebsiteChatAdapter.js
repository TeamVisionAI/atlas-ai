/**
 * Journey #6 — Website Chat channel adapter.
 */

const { ChannelAdapter } = require("../ChannelAdapter");
const { createMessageEnvelope } = require("../MessageEnvelope");

const CHANNEL_ID = "website-chat";

class WebsiteChatAdapter extends ChannelAdapter {
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL_ID });
  }

  receive(rawPayload) {
    const body = rawPayload || {};

    if (!body.text || !body.visitorId) {
      throw new Error("Invalid Website Chat payload");
    }

    return {
      messageId: body.messageId || null,
      visitorId: body.visitorId,
      sessionId: body.sessionId || body.visitorId,
      timestamp: body.timestamp || new Date().toISOString(),
      text: body.text,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      replyTo: body.replyTo || null,
      language: body.language || "en"
    };
  }

  normalize(parsed) {
    return createMessageEnvelope({
      messageId: parsed.messageId,
      channel: CHANNEL_ID,
      timestamp: parsed.timestamp,
      text: parsed.text,
      attachments: parsed.attachments || [],
      language: parsed.language || "en",
      replyTo: parsed.replyTo,
      deliveryContext: {
        visitorId: parsed.visitorId,
        sessionId: parsed.sessionId
      },
      metadata: {
        provider: CHANNEL_ID,
        sessionId: parsed.sessionId
      }
    });
  }

  async send(outbound) {
    return {
      success: true,
      channel: CHANNEL_ID,
      providerMessageId: outbound.providerMessageId || `mock.website.${Date.now()}`,
      sessionId: outbound.sessionId,
      text: outbound.text
    };
  }
}

module.exports = {
  WebsiteChatAdapter,
  CHANNEL_ID
};
