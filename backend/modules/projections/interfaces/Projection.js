/**
 * Sprint 14.4 — Projection interface contract.
 * All read-model projections must implement this interface.
 */

class Projection {
  /**
   * @returns {string}
   */
  name() {
    throw new Error("Projection.name() must be implemented.");
  }

  /**
   * One-time setup before handling events.
   * @returns {Promise<void>}
   */
  async initialize() {}

  /**
   * Handle a live Business Event envelope.
   * @param {Object} event — BusinessEvent.toJSON()
   * @returns {Promise<Object>}
   */
  async handle(_event) {
    throw new Error("Projection.handle() must be implemented.");
  }

  /**
   * Replay a chronological batch of Business Event envelopes.
   * @param {Object[]} events
   * @returns {Promise<Object>}
   */
  async replay(_events) {
    throw new Error("Projection.replay() must be implemented.");
  }

  /**
   * @returns {Object}
   */
  health() {
    return {
      name: this.name(),
      status: "unknown"
    };
  }
}

/**
 * @param {Object} candidate
 * @returns {boolean}
 */
function isProjection(candidate) {
  return (
    candidate &&
    typeof candidate.name === "function" &&
    typeof candidate.handle === "function" &&
    typeof candidate.replay === "function"
  );
}

/**
 * @param {Object} candidate
 */
function assertProjection(candidate) {
  if (!isProjection(candidate)) {
    throw new Error("Object does not implement the Projection interface.");
  }
}

module.exports = {
  Projection,
  isProjection,
  assertProjection
};
