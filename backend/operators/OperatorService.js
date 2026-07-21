/**
 * Sprint 12.4 — Operator domain service for conversation ownership transfer.
 */

const { AssignmentEngine } = require("./AssignmentEngine");
const { OperatorRepository } = require("./OperatorRepository");
const { OperatorEvent } = require("./operatorEvents");
const { CommunicationEvent } = require("../communication/events/eventNames");

class OperatorService {
  /**
   * @param {Object} [deps]
   * @param {OperatorRepository} [deps.repository]
   * @param {AssignmentEngine} [deps.assignmentEngine]
   * @param {import('../communication/gateway/ConversationManager').ConversationManager|null} [deps.conversationManager]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new OperatorRepository();
    this.assignmentEngine = deps.assignmentEngine || new AssignmentEngine();
    this.conversationManager = deps.conversationManager || null;
    this.eventBus = deps.eventBus || null;
  }

  /**
   * @param {import('../communication/gateway/ConversationManager').ConversationManager} conversationManager
   */
  bindConversationManager(conversationManager) {
    this.conversationManager = conversationManager;
  }

  /**
   * @param {Object} params
   * @param {string} params.id
   * @param {string} [params.displayName]
   */
  async registerOperator({ id, displayName = null }) {
    const operator = {
      id,
      displayName: displayName || id,
      status: "available",
      createdAt: new Date().toISOString()
    };

    return this.repository.save(operator);
  }

  /**
   * @param {string} operatorId
   */
  async getOperator(operatorId) {
    return this.repository.findById(operatorId);
  }

  /**
   * @param {string} conversationId
   * @param {string} operatorId
   */
  async assignConversation(conversationId, operatorId) {
    this._requireConversationManager();

    let operator = await this.repository.findById(operatorId);

    if (!operator) {
      operator = await this.registerOperator({ id: operatorId });
    }

    const conversation = await this.assignmentEngine.assignToOperator(
      this.conversationManager,
      conversationId,
      operatorId
    );

    this.eventBus?.emit(OperatorEvent.ASSIGNED, {
      conversation,
      operator
    });

    this.eventBus?.emit(CommunicationEvent.HUMAN_TAKEOVER, {
      conversation,
      operatorId
    });

    return { conversation, operator };
  }

  /**
   * @param {string} conversationId
   */
  async releaseConversation(conversationId) {
    this._requireConversationManager();

    const previous = this.conversationManager.getConversation(conversationId);
    const conversation = await this.assignmentEngine.releaseToAI(
      this.conversationManager,
      conversationId
    );

    this.eventBus?.emit(OperatorEvent.UNASSIGNED, {
      conversation,
      previousOperatorId: previous?.assignedOperatorId || null
    });

    this.eventBus?.emit(CommunicationEvent.HUMAN_RELEASE, {
      conversation
    });

    return conversation;
  }

  /**
   * @param {string} conversationId
   * @param {string} operatorId
   */
  async initiateTransfer(conversationId, operatorId) {
    this._requireConversationManager();

    let operator = await this.repository.findById(operatorId);

    if (!operator) {
      operator = await this.registerOperator({ id: operatorId });
    }

    const conversation = await this.assignmentEngine.initiateTransfer(
      this.conversationManager,
      conversationId,
      operatorId
    );

    this.eventBus?.emit(CommunicationEvent.CONVERSATION_UPDATED, {
      conversation,
      operatorId,
      reason: "transfer_pending"
    });

    return { conversation, operator };
  }

  /**
   * @param {string} conversationId
   */
  async completeTransfer(conversationId) {
    this._requireConversationManager();

    const conversation = await this.assignmentEngine.completeTransfer(
      this.conversationManager,
      conversationId
    );

    this.eventBus?.emit(OperatorEvent.ASSIGNED, {
      conversation,
      operator: await this.repository.findById(conversation.assignedOperatorId)
    });

    this.eventBus?.emit(CommunicationEvent.HUMAN_TAKEOVER, {
      conversation,
      operatorId: conversation.assignedOperatorId
    });

    return conversation;
  }

  _requireConversationManager() {
    if (!this.conversationManager) {
      throw new Error("OperatorService requires ConversationManager");
    }
  }
}

module.exports = {
  OperatorService
};
