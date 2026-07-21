/**
 * Journey #6 — Routes inbound platform payloads to the Atlas Agent.
 * No business logic.
 */

const crypto = require("crypto");
const { createMessageEnvelope, toAgentInput } = require("./MessageEnvelope");
const { GatewayEvent } = require("./GatewayEvents");
const { createGatewayResult } = require("./GatewayResult");
const gatewayStore = require("./GatewayStore");

class InboundRouter {
  /**
   * @param {Object} deps
   * @param {import('./ChannelRegistry').ChannelRegistry} deps.channelRegistry
   * @param {import('../communication/events/EventBus').EventBus} [deps.eventBus]
   * @param {import('../agent/runtime/AutonomousConversationRuntime').AutonomousConversationRuntime} deps.agentRuntime
   */
  constructor({ channelRegistry, eventBus = null, agentRuntime }) {
    if (!agentRuntime) {
      throw new Error("InboundRouter requires agentRuntime");
    }

    this.channelRegistry = channelRegistry;
    this.eventBus = eventBus;
    this.agentRuntime = agentRuntime;
  }

  /**
   * @param {string} channelId
   * @param {unknown} rawPayload
   * @param {Object} routingContext
   * @returns {Promise<Object>}
   */
  async route(channelId, rawPayload, routingContext = {}) {
    const correlationId = routingContext.correlationId || crypto.randomUUID();

    await gatewayStore.saveRawInbound({ channel: channelId, rawPayload, correlationId });
    this.eventBus?.emit(GatewayEvent.MESSAGE_RECEIVED, {
      channel: channelId,
      correlationId
    });

    try {
      const adapter = this.channelRegistry.get(channelId);
      const parsed = adapter.receive(rawPayload);
      const partial = adapter.normalize(parsed);

      const envelope = createMessageEnvelope({
        ...partial,
        organizationId: routingContext.organizationId || partial.organizationId || null,
        prospectId: routingContext.prospectId || partial.prospectId || null,
        conversationId: routingContext.conversationId || partial.conversationId || null
      });

      await gatewayStore.saveEnvelope({ envelope, correlationId });
      this.eventBus?.emit(GatewayEvent.MESSAGE_NORMALIZED, { envelope, correlationId });

      const agentInput = toAgentInput(envelope, {
        organization: routingContext.organization,
        prospectDisplayName: routingContext.prospectDisplayName,
        workflowName: routingContext.workflowName
      });

      const agentResult = await this.agentRuntime.processMessage(agentInput);

      if (agentResult.conversationId && !envelope.conversationId) {
        envelope.conversationId = agentResult.conversationId;
      }

      this.eventBus?.emit(GatewayEvent.MESSAGE_PROCESSED, {
        envelope,
        agentResult,
        correlationId
      });

      return createGatewayResult({
        success: true,
        correlationId,
        envelope,
        agentResult
      });
    } catch (error) {
      await gatewayStore.saveError({
        channel: channelId,
        rawPayload,
        error,
        correlationId
      });

      this.eventBus?.emit(GatewayEvent.CHANNEL_ERROR, {
        channel: channelId,
        error: error.message,
        correlationId
      });

      return createGatewayResult({
        success: false,
        correlationId,
        error: error.message
      });
    }
  }
}

module.exports = {
  InboundRouter
};
