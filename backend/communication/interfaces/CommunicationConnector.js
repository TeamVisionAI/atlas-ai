/**
 * Sprint 12.0/12.1 — CommunicationConnector contract.
 * Every channel adapter must implement this interface.
 */

const NOT_IMPLEMENTED = "CommunicationConnector method not implemented";

class CommunicationConnector {
  /**
   * @param {Object} config
   * @param {string} config.channelId — canonical channel key (e.g. messenger, instagram)
   */
  constructor(config = {}) {
    this.channelId = config.channelId || "unknown";
  }

  async connect() {
    throw new Error(NOT_IMPLEMENTED);
  }

  async disconnect() {
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * @param {unknown} providerPayload
   * @returns {Promise<import('../models/GatewayMessage').GatewayMessage[]>}
   */
  async receiveMessage(providerPayload) {
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * @param {import('../models/GatewayMessage').GatewayMessage} message
   */
  async sendMessage(message) {
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * @param {string} providerMessageId
   * @param {Record<string, unknown>} [context]
   */
  async markAsRead(providerMessageId, context = {}) {
    void providerMessageId;
    void context;
    throw new Error(NOT_IMPLEMENTED);
  }

  async typingIndicator(recipientId, isTyping) {
    throw new Error(NOT_IMPLEMENTED);
  }

  async healthCheck() {
    throw new Error(NOT_IMPLEMENTED);
  }
}

function assertConnectorImplementation(connector) {
  const required = [
    "connect",
    "disconnect",
    "receiveMessage",
    "sendMessage",
    "markAsRead",
    "typingIndicator",
    "healthCheck"
  ];

  for (const method of required) {
    if (typeof connector[method] !== "function") {
      throw new Error(`CommunicationConnector missing method: ${method}`);
    }
  }

  return connector;
}

module.exports = {
  CommunicationConnector,
  assertConnectorImplementation
};
