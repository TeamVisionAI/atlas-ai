/**
 * Journey #6 — Unified Communication Gateway.
 * Translates every external platform into a single internal message envelope.
 */

const { EventBus } = require("../communication/events/EventBus");
const { createAutonomousConversationRuntime } = require("../agent/runtime");
const { ChannelRegistry } = require("./ChannelRegistry");
const { InboundRouter } = require("./InboundRouter");
const { OutboundRouter } = require("./OutboundRouter");
const { GatewayEvent } = require("./GatewayEvents");
const { MessengerAdapter } = require("./adapters/MessengerAdapter");
const { WhatsAppAdapter } = require("./adapters/WhatsAppAdapter");
const { InstagramAdapter } = require("./adapters/InstagramAdapter");
const { WebsiteChatAdapter } = require("./adapters/WebsiteChatAdapter");
const {
  SMSAdapter,
  VoiceAdapter,
  EmailAdapter,
  TeamsAdapter,
  SlackAdapter
} = require("./adapters/PlaceholderAdapters");

class CommunicationGateway {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus} [deps.eventBus]
   * @param {ChannelRegistry} [deps.channelRegistry]
   * @param {import('../agent/runtime/AutonomousConversationRuntime').AutonomousConversationRuntime} [deps.agentRuntime]
   * @param {InboundRouter} [deps.inboundRouter]
   * @param {OutboundRouter} [deps.outboundRouter]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || new EventBus();
    this.channelRegistry = deps.channelRegistry || new ChannelRegistry();
    this.agentRuntime =
      deps.agentRuntime ||
      createAutonomousConversationRuntime({ eventBus: this.eventBus });

    this.inboundRouter =
      deps.inboundRouter ||
      new InboundRouter({
        channelRegistry: this.channelRegistry,
        eventBus: this.eventBus,
        agentRuntime: this.agentRuntime
      });

    this.outboundRouter =
      deps.outboundRouter ||
      new OutboundRouter({
        channelRegistry: this.channelRegistry,
        eventBus: this.eventBus
      });
  }

  /**
   * @param {import('./ChannelAdapter').ChannelAdapter} adapter
   */
  registerAdapter(adapter) {
    this.channelRegistry.register(adapter);
    this.eventBus.emit(GatewayEvent.CHANNEL_CONNECTED, { channel: adapter.channelId });
    return adapter;
  }

  /**
   * @param {string} channelId
   * @param {unknown} rawPayload
   * @param {Object} routingContext
   * @returns {Promise<Object>}
   */
  async receive(channelId, rawPayload, routingContext = {}) {
    const inboundResult = await this.inboundRouter.route(channelId, rawPayload, routingContext);

    if (!inboundResult.success) {
      return inboundResult;
    }

    const outboundResult = await this.outboundRouter.route({
      envelope: inboundResult.envelope,
      agentResult: inboundResult.agentResult,
      correlationId: inboundResult.correlationId
    });

    return {
      ...inboundResult,
      outbound: outboundResult.outbound,
      deliveryStatus: outboundResult.deliveryStatus,
      success: outboundResult.success
    };
  }

  /**
   * @param {Object} envelope
   * @param {Object} agentResult
   * @param {string} [correlationId]
   * @returns {Promise<Object>}
   */
  async send(envelope, agentResult, correlationId = null) {
    return this.outboundRouter.route({ envelope, agentResult, correlationId });
  }

  async healthCheck() {
    return this.channelRegistry.healthCheckAll();
  }
}

function registerDefaultAdapters(gateway) {
  gateway.registerAdapter(new MessengerAdapter());
  gateway.registerAdapter(new WhatsAppAdapter());
  gateway.registerAdapter(new InstagramAdapter());
  gateway.registerAdapter(new WebsiteChatAdapter());
  gateway.registerAdapter(new SMSAdapter());
  gateway.registerAdapter(new VoiceAdapter());
  gateway.registerAdapter(new EmailAdapter());
  gateway.registerAdapter(new TeamsAdapter());
  gateway.registerAdapter(new SlackAdapter());
}

function createCommunicationGateway(options = {}) {
  const gateway = new CommunicationGateway(options);

  if (options.registerDefaultAdapters !== false) {
    registerDefaultAdapters(gateway);
  }

  return gateway;
}

module.exports = {
  CommunicationGateway,
  createCommunicationGateway,
  registerDefaultAdapters
};
