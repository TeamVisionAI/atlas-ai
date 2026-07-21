/**
 * Sprint 12.1 — In-memory conversation lifecycle and history.
 */

const crypto = require("crypto");

const { Conversation } = require("../models/Conversation");
const { Participant } = require("../models/Participant");
const { ConversationStatus } = require("../constants/ConversationStatus");
const { OwnershipMode } = require("../constants/OwnershipMode");

class ConversationManager {
  constructor() {
    /** @type {Map<string, Conversation>} */
    this._conversations = new Map();
    /** @type {Map<string, string>} */
    this._conversationIndex = new Map();
    /** @type {Map<string, Participant>} */
    this._participants = new Map();
    /** @type {Map<string, import('../models/GatewayMessage').GatewayMessage[]>} */
    this._messages = new Map();
  }

  _participantKey(channel, channelUserId) {
    return `${channel}:${channelUserId}`;
  }

  _conversationKey(channel, atlasProspectId) {
    return `${channel}:${atlasProspectId}`;
  }

  /**
   * @param {Participant} participant
   * @returns {Promise<Participant>}
   */
  async resolveParticipant(participant) {
    const key = this._participantKey(participant.channel, participant.channelUserId);
    const existing = this._participants.get(key);

    if (existing) {
      return existing;
    }

    this._participants.set(key, participant);
    return participant;
  }

  /**
   * @param {Participant} participant
   * @returns {Promise<{ conversation: Conversation, created: boolean }>}
   */
  async findOrCreateConversation(participant) {
    const indexKey = this._conversationKey(participant.channel, participant.atlasProspectId);
    const existingId = this._conversationIndex.get(indexKey);

    if (existingId) {
      const conversation = this._conversations.get(existingId);

      if (conversation) {
        return { conversation, created: false };
      }
    }

    const conversation = new Conversation({
      id: crypto.randomUUID(),
      atlasProspectId: participant.atlasProspectId,
      channel: participant.channel,
      status: ConversationStatus.ACTIVE,
      ownershipMode: OwnershipMode.AI
    });

    this._conversations.set(conversation.id, conversation);
    this._conversationIndex.set(indexKey, conversation.id);
    this._messages.set(conversation.id, []);

    return { conversation, created: true };
  }

  /**
   * @param {string} conversationId
   * @returns {Conversation|null}
   */
  getConversation(conversationId) {
    return this._conversations.get(conversationId) || null;
  }

  /**
   * @param {string} conversationId
   * @param {import('../models/GatewayMessage').GatewayMessage} message
   */
  async appendMessage(conversationId, message) {
    const conversation = this._conversations.get(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const history = this._messages.get(conversationId) || [];
    history.push(message);
    this._messages.set(conversationId, history);

    conversation.updatedAt = new Date().toISOString();
    this._conversations.set(conversationId, conversation);

    return message;
  }

  /**
   * @param {string} conversationId
   * @returns {Promise<import('../models/GatewayMessage').GatewayMessage[]>}
   */
  async getHistory(conversationId) {
    return [...(this._messages.get(conversationId) || [])];
  }

  /**
   * @param {string} conversationId
   * @param {{ mode: string, operatorId?: string|null }} ownership
   */
  async setOwnership(conversationId, ownership) {
    return this.updateOwnership(conversationId, {
      ownershipMode: ownership.mode,
      assignedOperatorId: ownership.operatorId ?? null
    });
  }

  /**
   * @param {string} conversationId
   * @param {Object} patch
   * @param {string} [patch.ownershipMode]
   * @param {string|null} [patch.assignedOperatorId]
   * @param {string|null} [patch.assignedAt]
   * @param {string|null} [patch.releasedAt]
   */
  async updateOwnership(conversationId, patch) {
    const conversation = this._conversations.get(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    if (patch.ownershipMode !== undefined) {
      conversation.ownershipMode = patch.ownershipMode;
    }

    if (patch.assignedOperatorId !== undefined) {
      conversation.assignedOperatorId = patch.assignedOperatorId;
    }

    if (patch.assignedAt !== undefined) {
      conversation.assignedAt = patch.assignedAt;
    }

    if (patch.releasedAt !== undefined) {
      conversation.releasedAt = patch.releasedAt;
    }

    conversation.updatedAt = new Date().toISOString();
    this._conversations.set(conversationId, conversation);

    return conversation;
  }
}

module.exports = {
  ConversationManager
};
