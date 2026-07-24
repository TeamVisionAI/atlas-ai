/**
 * Sprint 14.1 — Lifecycle status value object.
 */

const {
  LIFECYCLE_STATES,
  ALLOWED_LIFECYCLE_TRANSITIONS,
  OWNERSHIP_VALUES
} = require("../constants");
const { ProspectDomainError } = require("../errors/ProspectDomainError");

class ProspectStatus {
  /**
   * @param {Object} props
   */
  constructor({
    lifecycleState,
    milestone = null,
    ownership = "SYSTEM",
    stateEnteredAt,
    previousState = null
  }) {
    this.lifecycleState = lifecycleState;
    this.milestone = milestone;
    this.ownership = ownership;
    this.stateEnteredAt = stateEnteredAt;
    this.previousState = previousState;
  }

  /**
   * @param {string} state
   * @returns {boolean}
   */
  static isValidState(state) {
    return Object.values(LIFECYCLE_STATES).includes(state);
  }

  /**
   * @param {string} fromState
   * @param {string} toState
   */
  static assertTransition(fromState, toState) {
    if (!ProspectStatus.isValidState(toState)) {
      throw new ProspectDomainError(`Invalid lifecycle state: ${toState}`, {
        publicCode: "INVALID_LIFECYCLE_STATE"
      });
    }

    if (fromState === toState) {
      return;
    }

    const allowed = ALLOWED_LIFECYCLE_TRANSITIONS[fromState] || [];

    if (!allowed.includes(toState)) {
      throw new ProspectDomainError(
        `Invalid lifecycle transition: ${fromState} → ${toState}`,
        { publicCode: "INVALID_LIFECYCLE_TRANSITION" }
      );
    }
  }

  /**
   * @param {string} lifecycleState
   * @param {Object} [options]
   * @returns {ProspectStatus}
   */
  static initial(lifecycleState = LIFECYCLE_STATES.NEW_LEAD, options = {}) {
    if (!ProspectStatus.isValidState(lifecycleState)) {
      throw new ProspectDomainError(`Invalid lifecycle state: ${lifecycleState}`, {
        publicCode: "INVALID_LIFECYCLE_STATE"
      });
    }

    if (options.ownership && !OWNERSHIP_VALUES.includes(options.ownership)) {
      throw new ProspectDomainError(`Invalid ownership value: ${options.ownership}`, {
        publicCode: "VALIDATION_ERROR"
      });
    }

    return new ProspectStatus({
      lifecycleState,
      milestone: options.milestone ?? null,
      ownership: options.ownership ?? "SYSTEM",
      stateEnteredAt: options.stateEnteredAt || new Date().toISOString(),
      previousState: null
    });
  }

  /**
   * @param {string} nextState
   * @param {Object} [options]
   * @returns {ProspectStatus}
   */
  transitionTo(nextState, options = {}) {
    ProspectStatus.assertTransition(this.lifecycleState, nextState);

    if (this.lifecycleState === nextState) {
      return new ProspectStatus({
        lifecycleState: this.lifecycleState,
        milestone: options.milestone ?? this.milestone,
        ownership: options.ownership ?? this.ownership,
        stateEnteredAt: this.stateEnteredAt,
        previousState: this.previousState
      });
    }

    return new ProspectStatus({
      lifecycleState: nextState,
      milestone: options.milestone ?? this.milestone,
      ownership: options.ownership ?? this.ownership,
      stateEnteredAt: new Date().toISOString(),
      previousState: this.lifecycleState
    });
  }

  toJSON() {
    return {
      lifecycleState: this.lifecycleState,
      milestone: this.milestone,
      ownership: this.ownership,
      stateEnteredAt: this.stateEnteredAt,
      previousState: this.previousState
    };
  }
}

module.exports = {
  ProspectStatus
};
