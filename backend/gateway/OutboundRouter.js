/**
 * Journey #6 — Routes Agent responses back to the originating channel.
 */

const { GatewayEvent } = require("./GatewayEvents");
const { createGatewayResult } = require("./GatewayResult");
const gatewayStore = require("./GatewayStore");

class OutboundRouter {
  /**
   * @param {Object} deps
   * @param {import('./ChannelRegistry').ChannelRegistry} deps.channelRegistry
   * @param {import('../communication/events/EventBus').EventBus} [deps.eventBus]
   */
  constructor({ channelRegistry, eventBus = null }) {
    this.channelRegistry = channelRegistry;
    this.eventBus = eventBus;
  }

  /**
   * @param {Object} params
   * @param {Object} params.envelope
   * @param {Object} params.agentResult
   * @param {string} [params.correlationId]
   * @returns {Promise<Object>}
   */
  async route({ envelope, agentResult, correlationId = null }) {
    const responseText = agentResult?.response?.text;

    if (!responseText) {
      return createGatewayResult({
        success: false,
        correlationId,
        envelope,
        agentResult,
        error: "Agent produced no response text"
      });
    }

    try {
      const adapter = this.channelRegistry.get(envelope.channel);
      const outbound = {
        text: responseText,
        recipientId:
          envelope.deliveryContext?.senderId ||
          envelope.deliveryContext?.visitorId ||
          null,
        sessionId: envelope.deliveryContext?.sessionId || null,
        conversationId: envelope.conversationId,
        replyTo: envelope.messageId
      };

      const deliveryStatus = await adapter.send(outbound);

      await gatewayStore.saveOutbound({
        envelope,
        responseText,
        deliveryStatus,
        correlationId
      });

      this.eventBus?.emit(GatewayEvent.MESSAGE_SENT, {
        envelope,
        responseText,
        deliveryStatus,
        correlationId
      });

      return createGatewayResult({
        success: true,
        correlationId,
        envelope,
        agentResult,
        outbound,
        deliveryStatus
      });
    } catch (error) {
      this.eventBus?.emit(GatewayEvent.CHANNEL_ERROR, {
        channel: envelope.channel,
        error: error.message,
        correlationId
      });

      return createGatewayResult({
        success: false,
        correlationId,
        envelope,
        agentResult,
        error: error.message
      });
    }
  }
}

module.exports = {
  OutboundRouter
};
