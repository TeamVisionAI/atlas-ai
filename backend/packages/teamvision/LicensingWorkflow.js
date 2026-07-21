/**
 * Release 1.1 — Team Vision licensing journey state machine.
 */

const LicensingState = Object.freeze({
  REGISTRATION: "registration",
  STUDY_STARTED: "study_started",
  STUDY_PROGRESS: "study_progress",
  PRACTICE_EXAM: "practice_exam",
  EXAM_SCHEDULED: "exam_scheduled",
  LICENSED: "licensed",
  PENDING: "pending",
  INACTIVE: "inactive"
});

const TRANSITIONS = Object.freeze({
  [LicensingState.REGISTRATION]: LicensingState.STUDY_STARTED,
  [LicensingState.STUDY_STARTED]: LicensingState.STUDY_PROGRESS,
  [LicensingState.STUDY_PROGRESS]: LicensingState.PRACTICE_EXAM,
  [LicensingState.PRACTICE_EXAM]: LicensingState.EXAM_SCHEDULED,
  [LicensingState.EXAM_SCHEDULED]: LicensingState.LICENSED,
  [LicensingState.LICENSED]: LicensingState.LICENSED,
  [LicensingState.PENDING]: LicensingState.STUDY_STARTED,
  [LicensingState.INACTIVE]: LicensingState.REGISTRATION
});

class LicensingWorkflow {
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.states = new Map();
  }

  start(candidateId) {
    this.states.set(candidateId, {
      candidateId,
      state: LicensingState.REGISTRATION,
      startedAt: new Date().toISOString()
    });

    this.eventBus?.emit("package.license.started", { candidateId });
    return this.getState(candidateId);
  }

  advance(candidateId, targetState = null) {
    const current = this.getState(candidateId);
    const nextState = targetState || TRANSITIONS[current.state];

    if (!nextState) {
      throw new Error(`No transition from licensing state ${current.state}`);
    }

    const updated = {
      ...current,
      state: nextState,
      updatedAt: new Date().toISOString()
    };

    this.states.set(candidateId, updated);

    if (nextState === LicensingState.LICENSED) {
      this.eventBus?.emit("package.license.completed", { candidateId });
    }

    return updated;
  }

  getState(candidateId) {
    return (
      this.states.get(candidateId) || {
        candidateId,
        state: LicensingState.INACTIVE,
        updatedAt: null
      }
    );
  }
}

module.exports = {
  LicensingWorkflow,
  LicensingState
};
