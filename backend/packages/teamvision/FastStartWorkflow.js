/**
 * Release 1.1 — Team Vision Fast Start milestone tracking.
 */

const FastStartMilestone = Object.freeze({
  FIRST_APPOINTMENT: "first_appointment",
  FIRST_RECRUIT: "first_recruit",
  FIRST_POLICY: "first_policy",
  FAST_START_COMPLETE: "fast_start_complete"
});

const MILESTONE_ORDER = Object.freeze([
  FastStartMilestone.FIRST_APPOINTMENT,
  FastStartMilestone.FIRST_RECRUIT,
  FastStartMilestone.FIRST_POLICY,
  FastStartMilestone.FAST_START_COMPLETE
]);

class FastStartWorkflow {
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.records = new Map();
  }

  initialize(candidateId) {
    const record = {
      candidateId,
      milestones: {},
      completed: false
    };

    this.records.set(candidateId, record);
    return record;
  }

  recordMilestone(candidateId, milestoneId) {
    const record = this.records.get(candidateId) || this.initialize(candidateId);
    record.milestones[milestoneId] = new Date().toISOString();

    const completedCount = MILESTONE_ORDER.filter((id) => record.milestones[id]).length;

    if (completedCount === MILESTONE_ORDER.length) {
      record.completed = true;
      record.completedAt = new Date().toISOString();
      this.eventBus?.emit("package.faststart.completed", { candidateId, record });
    }

    this.records.set(candidateId, record);
    return record;
  }

  getState(candidateId) {
    return this.records.get(candidateId) || this.initialize(candidateId);
  }
}

module.exports = {
  FastStartWorkflow,
  FastStartMilestone,
  MILESTONE_ORDER
};
