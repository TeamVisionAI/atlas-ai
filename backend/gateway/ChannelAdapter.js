/**
 * Journey #6 — Channel adapter contract.
 * Every platform adapter implements the same interface.
 */

const NOT_IMPLEMENTED = "ChannelAdapter method not implemented";

class ChannelAdapter {
  /**
   * @param {Object} config
   * @param {string} config.channelId
   */
  constructor(config = {}) {
    this.channelId = config.channelId || "unknown";
  }

  /**
   * Parse raw platform payload into an adapter-internal shape.
   * @param {unknown} rawPayload
   * @returns {unknown}
   */
  receive(rawPayload) {
    void rawPayload;
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * Map parsed payload into a partial MessageEnvelope (no org/prospect yet).
   * @param {unknown} parsed
   * @returns {Object}
   */
  normalize(parsed) {
    void parsed;
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * Send outbound response through the platform.
   * @param {Object} outbound
   * @returns {Promise<Object>}
   */
  async send(outbound) {
    void outbound;
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * Acknowledge delivery/read where supported.
   * @param {string} messageId
   * @param {Object} [context]
   * @returns {Promise<Object>}
   */
  async acknowledge(messageId, context = {}) {
    void messageId;
    void context;
    return { acknowledged: true, channel: this.channelId };
  }

  /**
   * @returns {Promise<Object>}
   */
  async health() {
    return { channel: this.channelId, status: "ok" };
  }
}

function assertAdapterImplementation(adapter) {
  const required = ["receive", "normalize", "send", "acknowledge", "health"];

  for (const method of required) {
    if (typeof adapter[method] !== "function") {
      throw new Error(`ChannelAdapter missing method: ${method}`);
    }
  }

  return adapter;
}

module.exports = {
  ChannelAdapter,
  assertAdapterImplementation
};
