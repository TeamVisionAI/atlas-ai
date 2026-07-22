/**
 * Sprint 12.1 — Facebook Messenger connector.
 * Messenger-specific code must not leave this module.
 */

const { CommunicationConnector } = require("../../interfaces/CommunicationConnector");
const { CHANNEL } = require("../../models/Channel");
const { LOG_COMPONENTS, logCommunication } = require("../../logging/communicationLogger");
const { parseMessengerWebhook } = require("./messengerWebhookParser");
const {
  sendTextMessage,
  markMessageSeen,
  sendTypingIndicator,
  verifyPageToken,
  getMessengerSendDiagnostics,
  getPageAccessToken
} = require("./messengerGraphClient");

class MessengerConnector extends CommunicationConnector {
  /**
   * @param {Object} [config]
   * @param {string} [config.pageAccessToken]
   * @param {string} [config.pageId]
   */
  constructor(config = {}) {
    super({ ...config, channelId: CHANNEL.MESSENGER });
    this.pageAccessToken = config.pageAccessToken || process.env.MESSENGER_PAGE_ACCESS_TOKEN || "";
    this.pageId = config.pageId || process.env.MESSENGER_PAGE_ID || "";
    this._connected = false;
  }

  async connect() {
    const health = await verifyPageToken(this.pageAccessToken);
  
    if (!health.healthy) {
      console.warn("⚠️ Messenger health check failed:", health.detail);
    }
  
    this._connected = true;
  
    logCommunication(LOG_COMPONENTS.MESSENGER, "Connected (validation skipped)", {
      pageId: this.pageId || null,
      health
    });
  
    return { connected: true };
  }

  async disconnect() {
    this._connected = false;

    logCommunication(LOG_COMPONENTS.MESSENGER, "Disconnected");

    return { connected: false };
  }

  /**
   * @param {unknown} providerPayload
   * @returns {Promise<import('../../models/GatewayMessage').GatewayMessage[]>}
   */
  async receiveMessage(providerPayload) {
    const messages = parseMessengerWebhook(providerPayload);

    for (const message of messages) {
      logCommunication(LOG_COMPONENTS.MESSENGER, "Incoming message", {
        senderId: message.senderId,
        type: message.type,
        messageId: message.id
      });
    }

    return messages;
  }

  /**
   * @param {import('../../models/GatewayMessage').GatewayMessage} message
   */
  async sendMessage(message) {
    const recipientId = message.recipientId || message.senderId;

    if (!recipientId) {
      throw new Error("Messenger sendMessage requires recipientId or senderId");
    }

    try {
      const result = await sendTextMessage({
        recipientId,
        text: message.text || "",
        pageAccessToken: this.pageAccessToken
      });

      logCommunication(LOG_COMPONENTS.MESSENGER, "Outgoing message sent", {
        recipientId,
        providerMessageId: result.providerMessageId
      });

      return result;
    } catch (error) {
      logCommunication(LOG_COMPONENTS.MESSENGER, "Outgoing message send failed", {
        level: "error",
        ...getMessengerSendDiagnostics(error, {
          recipientId,
          pageAccessTokenLoaded: Boolean(getPageAccessToken(this.pageAccessToken))
        })
      });

      throw error;
    }
  }

  /**
   * @param {string} providerMessageId — unused by Messenger mark_seen; recipient id preferred via metadata
   * @param {Object} [options]
   * @param {string} [options.recipientId]
   */
  async markAsRead(providerMessageId, options = {}) {
    void providerMessageId;

    const recipientId = options.recipientId;

    if (!recipientId) {
      return { success: false, reason: "recipientId required for Messenger markAsRead" };
    }

    await markMessageSeen({
      recipientId,
      pageAccessToken: this.pageAccessToken
    });

    return { success: true };
  }

  async typingIndicator(recipientId, isTyping) {
    await sendTypingIndicator({
      recipientId,
      isTyping,
      pageAccessToken: this.pageAccessToken
    });

    return { success: true };
  }

  async healthCheck() {
    const health = await verifyPageToken(this.pageAccessToken);

    return {
      healthy: health.healthy,
      detail: health.detail,
      connected: this._connected
    };
  }
}

module.exports = {
  MessengerConnector
};
