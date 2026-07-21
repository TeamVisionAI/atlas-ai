/**
 * Sprint 12.0/12.1 — Communication Gateway public exports.
 */

const { CommunicationGateway } = require("./gateway/CommunicationGateway");
const { ConnectorRegistry } = require("./gateway/ConnectorRegistry");
const { ConversationManager } = require("./gateway/ConversationManager");
const { MessageRouter } = require("./gateway/MessageRouter");
const {
  createCommunicationGateway,
  getCommunicationGateway
} = require("./gateway/createCommunicationGateway");
const {
  CommunicationConnector,
  assertConnectorImplementation
} = require("./interfaces/CommunicationConnector");
const { CHANNEL, MVP_CHANNELS, FUTURE_CHANNELS } = require("./models/Channel");
const { Conversation } = require("./models/Conversation");
const { GatewayMessage } = require("./models/GatewayMessage");
const { Participant } = require("./models/Participant");
const { MessengerConnector } = require("./connectors/messenger/MessengerConnector");
const { InstagramConnector } = require("./connectors/instagram/InstagramConnector");
const { AIAdapter } = require("./ai/AIAdapter");
const { EventBus } = require("./events/EventBus");
const { CommunicationEvent } = require("./events/eventNames");
const { ConversationStatus } = require("./constants/ConversationStatus");
const { OwnershipMode } = require("./constants/OwnershipMode");
const { MessageDirection } = require("./constants/MessageDirection");
const { MessageType } = require("./constants/MessageType");
const { ParticipantRole } = require("./constants/ParticipantRole");
const { LOG_COMPONENTS, logCommunication } = require("./logging/communicationLogger");

module.exports = {
  CommunicationGateway,
  ConnectorRegistry,
  ConversationManager,
  MessageRouter,
  createCommunicationGateway,
  getCommunicationGateway,
  CommunicationConnector,
  assertConnectorImplementation,
  CHANNEL,
  MVP_CHANNELS,
  FUTURE_CHANNELS,
  Conversation,
  GatewayMessage,
  Participant,
  MessengerConnector,
  InstagramConnector,
  AIAdapter,
  EventBus,
  CommunicationEvent,
  ConversationStatus,
  OwnershipMode,
  MessageDirection,
  MessageType,
  ParticipantRole,
  LOG_COMPONENTS,
  logCommunication
};
