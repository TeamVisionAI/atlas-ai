/**
 * Journey #7 — Base connector contract.
 * No workflow logic. No Agent logic.
 */

const { HEALTH_STATUS, createHealthResult } = require("./ConnectorHealth");

const NOT_IMPLEMENTED = "Connector method not implemented";

class BaseConnector {
  /**
   * @param {Object} config
   * @param {string} config.connectorId
   * @param {import('../../communication/events/EventBus').EventBus|null} [config.eventBus]
   */
  constructor(config = {}) {
    this.connectorId = config.connectorId || "unknown";
    this.eventBus = config.eventBus || null;
    this._connected = false;
    this._healthStatus = HEALTH_STATUS.DISCONNECTED;
  }

  async connect() {
    const health = await this.health();
    this._connected = health.status === HEALTH_STATUS.CONNECTED;
    this._healthStatus = health.status;
    return { connected: this._connected, connector: this.connectorId };
  }

  async disconnect() {
    this._connected = false;
    this._healthStatus = HEALTH_STATUS.DISCONNECTED;
    return { connected: false, connector: this.connectorId };
  }

  /**
   * @returns {Promise<Object>}
   */
  async health() {
    return createHealthResult(HEALTH_STATUS.DISCONNECTED, {
      connector: this.connectorId,
      detail: NOT_IMPLEMENTED
    });
  }

  /**
   * @param {unknown} payload
   * @returns {Promise<*>|*}
   */
  receive(payload) {
    void payload;
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * @param {Object} outbound
   * @returns {Promise<Object>}
   */
  async send(outbound) {
    void outbound;
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * @param {unknown} payload
   * @returns {boolean}
   */
  validate(payload) {
    void payload;
    throw new Error(NOT_IMPLEMENTED);
  }
}

module.exports = {
  BaseConnector
};
