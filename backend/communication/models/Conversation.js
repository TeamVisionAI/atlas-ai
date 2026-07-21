/**
 * Sprint 12.4/12.1 — Conversation thread owned by Atlas.
 */

const { ConversationStatus } = require("../constants/ConversationStatus");
const { OwnershipMode } = require("../constants/OwnershipMode");

class Conversation {
  /**
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.atlasProspectId
   * @param {string} params.channel
   * @param {string} [params.status]
   * @param {string} [params.ownershipMode]
   * @param {string|null} [params.assignedOperatorId]
   * @param {string|null} [params.assignedAt]
   * @param {string|null} [params.releasedAt]
   * @param {string} [params.createdAt]
   * @param {string} [params.updatedAt]
   * @param {Record<string, unknown>} [params.metadata]
   */
  constructor({
    id,
    atlasProspectId,
    channel,
    status = ConversationStatus.ACTIVE,
    ownershipMode = OwnershipMode.AI,
    assignedOperatorId = null,
    assignedAt = null,
    releasedAt = null,
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
    metadata = {}
  }) {
    this.id = id;
    this.atlasProspectId = atlasProspectId;
    this.channel = channel;
    this.status = status;
    this.ownershipMode = ownershipMode;
    this.assignedOperatorId = assignedOperatorId;
    this.assignedAt = assignedAt;
    this.releasedAt = releasedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.metadata = metadata;
  }
}

module.exports = {
  Conversation
};
