/**
 * Sprint 12.5 — Live index of active conversations for Mission Control.
 */

const { OwnershipMode } = require("../communication/constants/OwnershipMode");

class LiveConversationIndex {
  constructor() {
    /** @type {Map<string, Object>} */
    this._conversations = new Map();
    /** @type {Set<string>} */
    this._waitingForHuman = new Set();
  }

  /**
   * @param {Object} conversation
   * @param {Object} [options]
   * @param {boolean} [options.waitingForHuman]
   * @param {Object|null} [options.prospect]
   * @param {Object|null} [options.lastMessage]
   */
  upsert(conversation, options = {}) {
    if (!conversation?.id) {
      return null;
    }

    const waitingForHuman =
      options.waitingForHuman ?? this._waitingForHuman.has(conversation.id);

    const entry = {
      conversationId: conversation.id,
      atlasProspectId: conversation.atlasProspectId,
      channel: conversation.channel,
      ownershipMode: conversation.ownershipMode,
      assignedOperatorId: conversation.assignedOperatorId || null,
      assignedAt: conversation.assignedAt || null,
      releasedAt: conversation.releasedAt || null,
      updatedAt: conversation.updatedAt || new Date().toISOString(),
      waitingForHuman,
      prospect: options.prospect
        ? {
            atlasId: options.prospect.atlasId,
            displayName: options.prospect.displayName || null
          }
        : null,
      lastMessage: options.lastMessage
        ? {
            text: options.lastMessage.text || "",
            direction: options.lastMessage.direction || null,
            timestamp: options.lastMessage.timestamp || null
          }
        : null
    };

    this._conversations.set(conversation.id, entry);

    if (waitingForHuman) {
      this._waitingForHuman.add(conversation.id);
    } else if (conversation.ownershipMode !== OwnershipMode.HUMAN) {
      this._waitingForHuman.delete(conversation.id);
    }

    return entry;
  }

  /**
   * @param {string} conversationId
   */
  markWaitingForHuman(conversationId) {
    this._waitingForHuman.add(conversationId);

    const entry = this._conversations.get(conversationId);

    if (entry) {
      entry.waitingForHuman = true;
      entry.updatedAt = new Date().toISOString();
      this._conversations.set(conversationId, entry);
    }
  }

  /**
   * @param {string} conversationId
   */
  clearWaitingForHuman(conversationId) {
    this._waitingForHuman.delete(conversationId);

    const entry = this._conversations.get(conversationId);

    if (entry) {
      entry.waitingForHuman = false;
      this._conversations.set(conversationId, entry);
    }
  }

  /**
   * @returns {Object}
   */
  getCounters() {
    let aiOwned = 0;
    let humanOwned = 0;
    let transferPending = 0;
    let waitingForHuman = 0;

    for (const entry of this._conversations.values()) {
      if (entry.ownershipMode === OwnershipMode.AI) {
        aiOwned += 1;
      } else if (entry.ownershipMode === OwnershipMode.HUMAN) {
        humanOwned += 1;
      } else if (entry.ownershipMode === OwnershipMode.TRANSFER_PENDING) {
        transferPending += 1;
      }

      if (entry.waitingForHuman) {
        waitingForHuman += 1;
      }
    }

    return {
      totalActive: this._conversations.size,
      aiOwned,
      humanOwned,
      transferPending,
      waitingForHuman
    };
  }

  /**
   * @returns {Object[]}
   */
  getActiveConversations() {
    return Array.from(this._conversations.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  /**
   * @returns {Object[]}
   */
  getWaitingQueue() {
    return this.getActiveConversations().filter((entry) => entry.waitingForHuman);
  }

  /**
   * @param {string} conversationId
   */
  getConversation(conversationId) {
    return this._conversations.get(conversationId) || null;
  }
}

module.exports = {
  LiveConversationIndex
};
