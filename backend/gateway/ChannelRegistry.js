/**
 * Journey #6 — Register supported channel adapters.
 */

const { assertAdapterImplementation } = require("./ChannelAdapter");

class ChannelRegistry {
  constructor() {
    this.adapters = new Map();
  }

  /**
   * @param {import('./ChannelAdapter').ChannelAdapter} adapter
   */
  register(adapter) {
    assertAdapterImplementation(adapter);
    this.adapters.set(adapter.channelId, adapter);
    return adapter;
  }

  /**
   * @param {string} channelId
   * @returns {import('./ChannelAdapter').ChannelAdapter}
   */
  get(channelId) {
    const adapter = this.adapters.get(channelId);

    if (!adapter) {
      throw new Error(`No channel adapter registered for: ${channelId}`);
    }

    return adapter;
  }

  /**
   * @param {string} channelId
   * @returns {boolean}
   */
  has(channelId) {
    return this.adapters.has(channelId);
  }

  /**
   * @returns {string[]}
   */
  listChannels() {
    return [...this.adapters.keys()];
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async healthCheckAll() {
    const results = [];

    for (const adapter of this.adapters.values()) {
      results.push(await adapter.health());
    }

    return results;
  }
}

module.exports = {
  ChannelRegistry
};
