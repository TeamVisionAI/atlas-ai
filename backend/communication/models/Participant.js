/**
 * Sprint 12.0/12.1 — Participant identity within Atlas.
 */

const { ParticipantRole } = require("../constants/ParticipantRole");

class Participant {
  /**
   * @param {Object} params
   * @param {string} params.atlasProspectId
   * @param {string} [params.displayName]
   * @param {string} params.channel
   * @param {string} params.channelUserId
   * @param {string} [params.role]
   * @param {Record<string, unknown>} [params.metadata]
   */
  constructor({
    atlasProspectId,
    displayName = null,
    channel,
    channelUserId,
    role = ParticipantRole.PROSPECT,
    metadata = {}
  }) {
    this.atlasProspectId = atlasProspectId;
    this.displayName = displayName;
    this.channel = channel;
    this.channelUserId = channelUserId;
    this.role = role;
    this.metadata = metadata;
  }
}

module.exports = {
  Participant
};
