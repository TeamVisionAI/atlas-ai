/**
 * Sprint 12.3 — In-memory prospect persistence (repository layer).
 * Production target: Supabase-backed implementation with the same interface.
 */

class ProspectRepository {
  constructor() {
    /** @type {Map<string, Object>} */
    this._prospects = new Map();
    /** @type {Map<string, string>} */
    this._channelIndex = new Map();
    this._sequence = 0;
  }

  _channelKey(channel, channelUserId) {
    return `${channel}:${channelUserId}`;
  }

  /**
   * @returns {Promise<number>}
   */
  async nextSequence() {
    this._sequence += 1;
    return this._sequence;
  }

  /**
   * @param {string} channel
   * @param {string} channelUserId
   * @returns {Promise<Object|null>}
   */
  async findByChannelIdentity(channel, channelUserId) {
    const atlasId = this._channelIndex.get(this._channelKey(channel, channelUserId));
    return atlasId ? this._prospects.get(atlasId) || null : null;
  }

  /**
   * @param {string} atlasId
   * @returns {Promise<Object|null>}
   */
  async findByAtlasId(atlasId) {
    return this._prospects.get(atlasId) || null;
  }

  /**
   * @param {Object} prospect
   */
  async save(prospect) {
    this._prospects.set(prospect.atlasId, prospect);

    for (const identity of prospect.channelIdentities || []) {
      this._channelIndex.set(
        this._channelKey(identity.channel, identity.channelUserId),
        prospect.atlasId
      );
    }

    return prospect;
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async listAll() {
    return Array.from(this._prospects.values());
  }
}

module.exports = {
  ProspectRepository
};
