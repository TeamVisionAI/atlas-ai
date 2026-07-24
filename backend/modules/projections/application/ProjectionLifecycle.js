/**
 * Sprint 14.4 — Projection lifecycle states.
 */

const PROJECTION_STATES = Object.freeze({
  REGISTERED: "registered",
  INITIALIZED: "initialized",
  RUNNING: "running",
  STOPPED: "stopped"
});

class ProjectionLifecycle {
  constructor() {
    this.states = new Map();
  }

  /**
   * @param {string} name
   */
  markRegistered(name) {
    this.states.set(name, PROJECTION_STATES.REGISTERED);
  }

  /**
   * @param {string} name
   */
  markInitialized(name) {
    this.states.set(name, PROJECTION_STATES.INITIALIZED);
  }

  /**
   * @param {string} name
   */
  markRunning(name) {
    this.states.set(name, PROJECTION_STATES.RUNNING);
  }

  /**
   * @param {string} name
   */
  markStopped(name) {
    this.states.set(name, PROJECTION_STATES.STOPPED);
  }

  /**
   * @param {string} name
   * @returns {string|undefined}
   */
  getState(name) {
    return this.states.get(name);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  isRunning(name) {
    return this.getState(name) === PROJECTION_STATES.RUNNING;
  }
}

module.exports = {
  PROJECTION_STATES,
  ProjectionLifecycle
};
