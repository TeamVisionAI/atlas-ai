/**
 * Sprint 12.0 — Registry of channel connectors.
 * The Communication Gateway is the only component that uses this registry.
 */

const { assertConnectorImplementation } = require("../interfaces/CommunicationConnector");

class ConnectorRegistry {
  constructor() {
    /** @type {Map<string, import('../interfaces/CommunicationConnector').CommunicationConnector>} */
    this._connectors = new Map();
  }

  /**
   * @param {import('../interfaces/CommunicationConnector').CommunicationConnector} connector
   */
  register(connector) {
    assertConnectorImplementation(connector);
    this._connectors.set(connector.channelId, connector);
    return connector;
  }

  /**
   * @param {string} channelId
   * @returns {import('../interfaces/CommunicationConnector').CommunicationConnector|undefined}
   */
  get(channelId) {
    return this._connectors.get(channelId);
  }

  /**
   * @returns {string[]}
   */
  listChannelIds() {
    return Array.from(this._connectors.keys());
  }

  /**
   * @returns {Promise<Array<{ channelId: string, healthy: boolean, detail?: string }>>}
   */
  async healthCheckAll() {
    const results = [];

    for (const [channelId, connector] of this._connectors.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const health = await connector.healthCheck();
      results.push({ channelId, ...health });
    }

    return results;
  }
}

module.exports = {
  ConnectorRegistry
};
