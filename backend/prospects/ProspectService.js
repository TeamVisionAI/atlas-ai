/**
 * Sprint 12.3 — Prospect domain service.
 * Separate from conversations — maps channel identities to permanent Atlas IDs.
 */

const { AtlasIdGenerator } = require("./AtlasIdGenerator");
const { ProspectFactory } = require("./ProspectFactory");
const { ProspectRepository } = require("./ProspectRepository");
const { ProspectEvent } = require("./prospectEvents");

class ProspectService {
  /**
   * @param {Object} [deps]
   * @param {ProspectRepository} [deps.repository]
   * @param {ProspectFactory} [deps.factory]
   * @param {AtlasIdGenerator} [deps.idGenerator]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.repository = deps.repository || new ProspectRepository();
    this.factory = deps.factory || new ProspectFactory();
    this.idGenerator = deps.idGenerator || new AtlasIdGenerator(this.repository);
    this.eventBus = deps.eventBus || null;
  }

  /**
   * Find or create a prospect from a channel identity.
   * @param {Object} params
   * @param {string} params.channel
   * @param {string} params.channelUserId
   * @param {string|null} [params.displayName]
   * @returns {Promise<{ prospect: Object, created: boolean, channelLinked: boolean }>}
   */
  async resolveFromChannelIdentity({ channel, channelUserId, displayName = null }) {
    const existing = await this.repository.findByChannelIdentity(channel, channelUserId);

    if (existing) {
      const prospect = await this.updateLastActivity(existing.atlasId);

      this.eventBus?.emit(ProspectEvent.UPDATED, {
        prospect,
        reason: "activity"
      });

      return {
        prospect,
        created: false,
        channelLinked: false
      };
    }

    const atlasId = await this.idGenerator.nextId();
    const prospect = this.factory.create({
      atlasId,
      channel,
      channelUserId,
      displayName
    });

    await this.repository.save(prospect);

    this.eventBus?.emit(ProspectEvent.CREATED, { prospect });

    return {
      prospect,
      created: true,
      channelLinked: true
    };
  }

  /**
   * Link an additional channel identity to an existing prospect.
   * @param {string} atlasId
   * @param {string} channel
   * @param {string} channelUserId
   */
  async linkChannel(atlasId, channel, channelUserId) {
    const prospect = await this.repository.findByAtlasId(atlasId);

    if (!prospect) {
      throw new Error(`Prospect not found: ${atlasId}`);
    }

    const existingIdentity = prospect.channelIdentities?.find(
      (identity) => identity.channel === channel && identity.channelUserId === channelUserId
    );

    if (existingIdentity) {
      return { prospect, linked: false };
    }

    const conflict = await this.repository.findByChannelIdentity(channel, channelUserId);

    if (conflict && conflict.atlasId !== atlasId) {
      throw new Error(`Channel identity already linked to ${conflict.atlasId}`);
    }

    const updated = this.factory.addChannelIdentity(prospect, channel, channelUserId);
    await this.repository.save(updated);

    this.eventBus?.emit(ProspectEvent.LINKED_CHANNEL, {
      prospect: updated,
      channel,
      channelUserId
    });

    this.eventBus?.emit(ProspectEvent.UPDATED, {
      prospect: updated,
      reason: "channel_linked"
    });

    return { prospect: updated, linked: true };
  }

  /**
   * @param {string} atlasId
   */
  async updateLastActivity(atlasId) {
    const prospect = await this.repository.findByAtlasId(atlasId);

    if (!prospect) {
      throw new Error(`Prospect not found: ${atlasId}`);
    }

    const now = new Date().toISOString();
    const updated = {
      ...prospect,
      lastActivityAt: now,
      updatedAt: now
    };

    await this.repository.save(updated);
    return updated;
  }

  /**
   * @param {string} channel
   * @param {string} channelUserId
   */
  async findByChannelIdentity(channel, channelUserId) {
    return this.repository.findByChannelIdentity(channel, channelUserId);
  }

  /**
   * @param {string} atlasId
   */
  async findByAtlasId(atlasId) {
    return this.repository.findByAtlasId(atlasId);
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async listProspects() {
    return this.repository.listAll();
  }
}

module.exports = {
  ProspectService
};
