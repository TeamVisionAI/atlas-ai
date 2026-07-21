/**
 * Sprint 12.3 — Communication Gateway with prospect intelligence.
 */

const { ConnectorRegistry } = require("./ConnectorRegistry");
const { ConversationManager } = require("./ConversationManager");
const { MessageRouter } = require("./MessageRouter");
const { EventBus } = require("../events/EventBus");
const { CommunicationEvent } = require("../events/eventNames");
const { assertConnectorImplementation } = require("../interfaces/CommunicationConnector");
const { Participant } = require("../models/Participant");
const { ParticipantRole } = require("../constants/ParticipantRole");
const { OwnershipMode } = require("../constants/OwnershipMode");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");

class CommunicationGateway {
  /**
   * @param {Object} [deps]
   * @param {ConnectorRegistry} [deps.connectorRegistry]
   * @param {ConversationManager} [deps.conversationManager]
   * @param {MessageRouter} [deps.messageRouter]
   * @param {EventBus} [deps.eventBus]
   * @param {import('../../prospects/ProspectService').ProspectService|null} [deps.prospectService]
   * @param {import('../../operators/OperatorService').OperatorService|null} [deps.operatorService]
   * @param {import('../../workflows/WorkflowEngine').WorkflowEngine|null} [deps.workflowEngine]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || new EventBus();
    this.connectorRegistry = deps.connectorRegistry || new ConnectorRegistry();
    this.conversationManager = deps.conversationManager || new ConversationManager();
    this.prospectService = deps.prospectService || null;
    this.operatorService = deps.operatorService || null;
    this.workflowEngine = deps.workflowEngine || null;

    if (this.operatorService) {
      this.operatorService.bindConversationManager(this.conversationManager);
    }

    this.messageRouter =
      deps.messageRouter ||
      new MessageRouter({
        connectorRegistry: this.connectorRegistry,
        conversationManager: this.conversationManager,
        eventBus: this.eventBus
      });
  }

  registerConnector(connector) {
    assertConnectorImplementation(connector);
    return this.connectorRegistry.register(connector);
  }

  /**
   * @param {string} channelId
   * @param {unknown} providerPayload
   */
  async receive(channelId, providerPayload) {
    const connector = this.connectorRegistry.get(channelId);

    if (!connector) {
      throw new Error(`No connector registered for channel: ${channelId}`);
    }

    logCommunication(LOG_COMPONENTS.GATEWAY, "Inbound webhook received", { channel: channelId });

    const messages = await connector.receiveMessage(providerPayload);
    const results = [];

    for (const message of messages) {
      logCommunication(LOG_COMPONENTS.GATEWAY, "Normalized message received", {
        channel: message.channel,
        senderId: message.senderId,
        type: message.type,
        messageId: message.id
      });

      let prospect = null;
      let prospectCreated = false;

      if (this.prospectService) {
        const resolution = await this.prospectService.resolveFromChannelIdentity({
          channel: message.channel,
          channelUserId: message.senderId
        });

        prospect = resolution.prospect;
        prospectCreated = resolution.created;

        logCommunication(LOG_COMPONENTS.GATEWAY, "Prospect resolved", {
          atlasId: prospect.atlasId,
          created: prospectCreated
        });
      }

      const atlasProspectId = prospect?.atlasId || `${message.channel}:${message.senderId}`;

      const participant = new Participant({
        atlasProspectId,
        displayName: prospect?.displayName || null,
        channel: message.channel,
        channelUserId: message.senderId,
        role: ParticipantRole.PROSPECT,
        metadata: prospect ? { atlasId: prospect.atlasId } : {}
      });

      await this.conversationManager.resolveParticipant(participant);

      const { conversation, created } =
        await this.conversationManager.findOrCreateConversation(participant);

      message.conversationId = conversation.id;

      await this.conversationManager.appendMessage(conversation.id, message);

      if (created) {
        this.eventBus.emit(CommunicationEvent.CONVERSATION_CREATED, {
          conversation,
          message,
          prospect
        });
      }

      this.eventBus.emit(CommunicationEvent.MESSAGE_RECEIVED, {
        conversation,
        message,
        prospect
      });

      const routeResult = await this.messageRouter.routeInbound(message, conversation);

      let workflowResult = null;

      if (this.workflowEngine && routeResult.aiInvoked) {
        workflowResult = await this.workflowEngine.processAfterAiResponse({
          prospect,
          conversation,
          inboundMessage: message,
          aiResult: routeResult.aiResult,
          outboundMessage: routeResult.outboundMessage
        });
      }

      let sendResult = null;

      if (routeResult.outboundMessage) {
        sendResult = await this.send(routeResult.outboundMessage);
      }

      const updatedConversation =
        this.conversationManager.getConversation(conversation.id) || conversation;

      if (!created) {
        this.eventBus.emit(CommunicationEvent.CONVERSATION_UPDATED, {
          conversation: updatedConversation,
          message,
          routeResult,
          prospect
        });
      }

      results.push({
        message,
        conversation: updatedConversation,
        prospect,
        prospectCreated,
        created,
        routeResult,
        sendResult,
        workflowResult
      });
    }

    return results;
  }

  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} message
   */
  async send(message) {
    const connector = this.connectorRegistry.get(message.channel);

    if (!connector) {
      throw new Error(`No connector registered for channel: ${message.channel}`);
    }

    logCommunication(LOG_COMPONENTS.GATEWAY, "Outbound message", {
      channel: message.channel,
      conversationId: message.conversationId,
      recipientId: message.recipientId
    });

    const result = await connector.sendMessage(message);

    if (message.conversationId) {
      await this.conversationManager.appendMessage(message.conversationId, message);
    }

    const conversation = message.conversationId
      ? this.conversationManager.getConversation(message.conversationId)
      : null;

    let prospect = null;

    if (conversation?.atlasProspectId && this.prospectService) {
      prospect = await this.prospectService.findByAtlasId(conversation.atlasProspectId);
    }

    this.eventBus.emit(CommunicationEvent.MESSAGE_SENT, {
      message,
      result,
      conversation,
      prospect
    });

    if (conversation) {
      this.eventBus.emit(CommunicationEvent.CONVERSATION_UPDATED, {
        conversation,
        message,
        direction: message.direction,
        prospect
      });
    }

    return result;
  }

  async handleOutbound(message) {
    return this.send(message);
  }

  async enableHumanTakeover(conversationId, operatorId) {
    if (this.operatorService) {
      const { conversation } = await this.operatorService.assignConversation(
        conversationId,
        operatorId
      );

      this.eventBus.emit(CommunicationEvent.CONVERSATION_UPDATED, {
        conversation,
        reason: "human_takeover"
      });

      return conversation;
    }

    const conversation = await this.conversationManager.updateOwnership(conversationId, {
      ownershipMode: OwnershipMode.HUMAN,
      assignedOperatorId: operatorId,
      assignedAt: new Date().toISOString(),
      releasedAt: null
    });

    this.eventBus.emit(CommunicationEvent.HUMAN_TAKEOVER, {
      conversation,
      operatorId
    });

    this.eventBus.emit(CommunicationEvent.CONVERSATION_UPDATED, {
      conversation,
      reason: "human_takeover"
    });

    return conversation;
  }

  async disableHumanTakeover(conversationId) {
    if (this.operatorService) {
      const conversation = await this.operatorService.releaseConversation(conversationId);

      this.eventBus.emit(CommunicationEvent.CONVERSATION_UPDATED, {
        conversation,
        reason: "human_release"
      });

      return conversation;
    }

    const conversation = await this.conversationManager.updateOwnership(conversationId, {
      ownershipMode: OwnershipMode.AI,
      assignedOperatorId: null,
      assignedAt: null,
      releasedAt: new Date().toISOString()
    });

    this.eventBus.emit(CommunicationEvent.HUMAN_RELEASE, {
      conversation
    });

    this.eventBus.emit(CommunicationEvent.CONVERSATION_UPDATED, {
      conversation,
      reason: "human_release"
    });

    return conversation;
  }

  /**
   * @param {string} conversationId
   * @param {string} operatorId
   */
  async assignToOperator(conversationId, operatorId) {
    if (!this.operatorService) {
      return this.enableHumanTakeover(conversationId, operatorId);
    }

    const { conversation } = await this.operatorService.assignConversation(
      conversationId,
      operatorId
    );

    return conversation;
  }

  /**
   * @param {string} conversationId
   */
  async releaseToAI(conversationId) {
    if (!this.operatorService) {
      return this.disableHumanTakeover(conversationId);
    }

    return this.operatorService.releaseConversation(conversationId);
  }

  async healthCheck() {
    return this.connectorRegistry.healthCheckAll();
  }
}

module.exports = {
  CommunicationGateway
};
