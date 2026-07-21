/**
 * Release 1.1 — Team Vision orientation workflow.
 */

const OrientationState = Object.freeze({
  NOT_STARTED: "not_started",
  SCHEDULED: "orientation_scheduled",
  COMPLETED: "orientation_completed"
});

class OrientationWorkflow {
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.records = new Map();
  }

  schedule(candidateId, details = {}) {
    const record = {
      candidateId,
      state: OrientationState.SCHEDULED,
      trainer: details.trainer || null,
      office: details.office || null,
      leader: details.leader || null,
      scheduledAt: details.scheduledAt || new Date().toISOString()
    };

    this.records.set(candidateId, record);
    return record;
  }

  complete(candidateId, details = {}) {
    const record = {
      ...(this.records.get(candidateId) || { candidateId }),
      state: OrientationState.COMPLETED,
      trainer: details.trainer || null,
      office: details.office || null,
      leader: details.leader || null,
      firstActivity: details.firstActivity || null,
      completedAt: new Date().toISOString()
    };

    this.records.set(candidateId, record);
    this.eventBus?.emit("package.orientation.completed", { candidateId, record });
    return record;
  }

  getState(candidateId) {
    return (
      this.records.get(candidateId) || {
        candidateId,
        state: OrientationState.NOT_STARTED
      }
    );
  }
}

module.exports = {
  OrientationWorkflow,
  OrientationState
};
