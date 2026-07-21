/**
 * Journey #7 — Production connector registry.
 */

const { BaseConnector } = require("./BaseConnector");

class ConnectorRegistry {
  constructor() {
    this.connectors = new Map();
  }

  /**
   * @param {BaseConnector} connector
   */
  register(connector) {
    if (!(connector instanceof BaseConnector)) {
      throw new Error("Connector must extend BaseConnector");
    }

    this.connectors.set(connector.connectorId, connector);
    return connector;
  }

  /**
   * @param {string} connectorId
   * @returns {BaseConnector}
   */
  get(connectorId) {
    const connector = this.connectors.get(connectorId);

    if (!connector) {
      throw new Error(`No connector registered for: ${connectorId}`);
    }

    return connector;
  }

  /**
   * @param {string} connectorId
   * @returns {boolean}
   */
  has(connectorId) {
    return this.connectors.has(connectorId);
  }

  /**
   * @returns {string[]}
   */
  list() {
    return [...this.connectors.keys()];
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async healthCheckAll() {
    const results = [];

    for (const connector of this.connectors.values()) {
      results.push(await connector.health());
    }

    return results;
  }
}

module.exports = {
  ConnectorRegistry
};
