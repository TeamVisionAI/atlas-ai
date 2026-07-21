/**
 * Sprint 12.4 — Conversation ownership transfer engine.
 */

const { OwnershipMode } = require("../communication/constants/OwnershipMode");

class AssignmentEngine {
  /**
   * Assign conversation to a human operator.
   * @param {import('../communication/gateway/ConversationManager').ConversationManager} conversationManager
   * @param {string} conversationId
   * @param {string} operatorId
   */
  async assignToOperator(conversationManager, conversationId, operatorId) {
    const now = new Date().toISOString();

    return conversationManager.updateOwnership(conversationId, {
      ownershipMode: OwnershipMode.HUMAN,
      assignedOperatorId: operatorId,
      assignedAt: now,
      releasedAt: null
    });
  }

  /**
   * Mark transfer in progress before operator accepts.
   * @param {import('../communication/gateway/ConversationManager').ConversationManager} conversationManager
   * @param {string} conversationId
   * @param {string} operatorId
   */
  async initiateTransfer(conversationManager, conversationId, operatorId) {
    const now = new Date().toISOString();

    return conversationManager.updateOwnership(conversationId, {
      ownershipMode: OwnershipMode.TRANSFER_PENDING,
      assignedOperatorId: operatorId,
      assignedAt: now,
      releasedAt: null
    });
  }

  /**
   * Complete a pending transfer — operator assumes ownership.
   * @param {import('../communication/gateway/ConversationManager').ConversationManager} conversationManager
   * @param {string} conversationId
   */
  async completeTransfer(conversationManager, conversationId) {
    const conversation = conversationManager.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    if (conversation.ownershipMode !== OwnershipMode.TRANSFER_PENDING) {
      throw new Error("Conversation is not pending transfer");
    }

    const now = new Date().toISOString();

    return conversationManager.updateOwnership(conversationId, {
      ownershipMode: OwnershipMode.HUMAN,
      assignedOperatorId: conversation.assignedOperatorId,
      assignedAt: now,
      releasedAt: null
    });
  }

  /**
   * Release conversation back to AI ownership.
   * @param {import('../communication/gateway/ConversationManager').ConversationManager} conversationManager
   * @param {string} conversationId
   */
  async releaseToAI(conversationManager, conversationId) {
    const now = new Date().toISOString();

    return conversationManager.updateOwnership(conversationId, {
      ownershipMode: OwnershipMode.AI,
      assignedOperatorId: null,
      assignedAt: null,
      releasedAt: now
    });
  }
}

module.exports = {
  AssignmentEngine
};
