/**
 * Sprint 12.4 — Routes normalized messages between connectors and Atlas AI.
 */

const { OwnershipMode } = require("../constants/OwnershipMode");
const { CommunicationEvent } = require("../events/eventNames");
const { LOG_COMPONENTS, logCommunication } = require("../logging/communicationLogger");
const { AIAdapter } = require("../ai/AIAdapter");

class MessageRouter {
  /**
   * @param {Object} deps
   * @param {import('./ConnectorRegistry').ConnectorRegistry} deps.connectorRegistry
   * @param {import('./ConversationManager').ConversationManager} deps.conversationManager
   * @param {import('../events/EventBus').EventBus} [deps.eventBus]
   * @param {AIAdapter} [deps.aiAdapter]
   */
  constructor({ connectorRegistry, conversationManager, eventBus = null, aiAdapter = null }) {
    this.connectorRegistry = connectorRegistry;
    this.conversationManager = conversationManager;
    this.eventBus = eventBus;
    this.aiAdapter = aiAdapter || new AIAdapter();
  }

  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} message
   * @param {import('../models/Conversation').Conversation} conversation
   */
  async routeInbound(message, conversation) {
    logCommunication(LOG_COMPONENTS.ROUTER, "Conversation located", {
      conversationId: conversation.id,
      ownershipMode: conversation.ownershipMode,
      assignedOperatorId: conversation.assignedOperatorId,
      channel: message.channel,
      messageId: message.id
    });

    if (
      conversation.ownershipMode === OwnershipMode.HUMAN ||
      conversation.ownershipMode === OwnershipMode.TRANSFER_PENDING
    ) {
      logCommunication(LOG_COMPONENTS.ROUTER, "AI routing skipped — human ownership active", {
        conversationId: conversation.id,
        ownershipMode: conversation.ownershipMode
      });

      if (conversation.ownershipMode === OwnershipMode.HUMAN) {
        this.eventBus?.emit(CommunicationEvent.HUMAN_MESSAGE_WAITING, {
          conversation,
          message,
          assignedOperatorId: conversation.assignedOperatorId
        });
      }

      return {
        routed: true,
        aiInvoked: false,
        skippedReason:
          conversation.ownershipMode === OwnershipMode.HUMAN
            ? "HUMAN_TAKEOVER"
            : "TRANSFER_PENDING",
        outboundMessage: null
      };
    }

    if (conversation.ownershipMode !== OwnershipMode.AI) {
      return {
        routed: true,
        aiInvoked: false,
        outboundMessage: null
      };
    }

    const history = await this.conversationManager.getHistory(conversation.id);
    const aiResult = await this.aiAdapter.generateReply(message, history);

    if (aiResult.fallback) {
      this.eventBus?.emit(CommunicationEvent.AI_ERROR, {
        conversation,
        message,
        error: aiResult.error || "AI request failed"
      });
    } else {
      this.eventBus?.emit(CommunicationEvent.AI_RESPONSE_GENERATED, {
        conversation,
        inboundMessage: message,
        aiResult
      });
    }

    const outboundMessage = this.aiAdapter.buildOutboundMessage(message, aiResult);

    return {
      routed: true,
      aiInvoked: true,
      outboundMessage,
      aiResult
    };
  }
}

module.exports = {
  MessageRouter
};
