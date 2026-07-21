/**
 * Sprint 12.3 — Prospect entity factory.
 */

class ProspectFactory {
  /**
   * @param {Object} params
   * @param {string} params.atlasId
   * @param {string} params.channel
   * @param {string} params.channelUserId
   * @param {string|null} [params.displayName]
   */
  create({ atlasId, channel, channelUserId, displayName = null }) {
    const now = new Date().toISOString();

    return {
      atlasId,
      displayName,
      channelIdentities: [
        {
          channel,
          channelUserId,
          linkedAt: now
        }
      ],
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now
    };
  }

  /**
   * @param {Object} prospect
   * @param {string} channel
   * @param {string} channelUserId
   */
  addChannelIdentity(prospect, channel, channelUserId) {
    const now = new Date().toISOString();
    const identities = prospect.channelIdentities || [];

    identities.push({
      channel,
      channelUserId,
      linkedAt: now
    });

    return {
      ...prospect,
      channelIdentities: identities,
      updatedAt: now,
      lastActivityAt: now
    };
  }
}

module.exports = {
  ProspectFactory
};
