/**
 * Journey #6 — Unified Communication Gateway exports.
 */

const { AGENT_TRANSPORT, ENVELOPE_FIELDS, createMessageEnvelope, envelopeStructureKeys, toAgentInput } =
  require("./MessageEnvelope");
const { GatewayEvent } = require("./GatewayEvents");
const { createGatewayResult } = require("./GatewayResult");
const gatewayStore = require("./GatewayStore");
const { ChannelAdapter, assertAdapterImplementation } = require("./ChannelAdapter");
const { ChannelRegistry } = require("./ChannelRegistry");
const { InboundRouter } = require("./InboundRouter");
const { OutboundRouter } = require("./OutboundRouter");
const {
  CommunicationGateway,
  createCommunicationGateway,
  registerDefaultAdapters
} = require("./CommunicationGateway");
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

module.exports = {
  AGENT_TRANSPORT,
  ENVELOPE_FIELDS,
  createMessageEnvelope,
  envelopeStructureKeys,
  toAgentInput,
  GatewayEvent,
  createGatewayResult,
  gatewayStore,
  ChannelAdapter,
  assertAdapterImplementation,
  ChannelRegistry,
  InboundRouter,
  OutboundRouter,
  CommunicationGateway,
  createCommunicationGateway,
  registerDefaultAdapters,
  MessengerAdapter,
  WhatsAppAdapter,
  InstagramAdapter,
  WebsiteChatAdapter,
  SMSAdapter,
  VoiceAdapter,
  EmailAdapter,
  TeamsAdapter,
  SlackAdapter
};
