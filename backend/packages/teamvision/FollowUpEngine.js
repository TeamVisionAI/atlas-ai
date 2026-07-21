/**
 * Release 1.1 — Configurable follow-up sequences.
 */

const DEFAULT_SEQUENCES = Object.freeze({
  after_interview: {
    id: "after_interview",
    trigger: "interview.completed",
    steps: [
      { message: "Thank you for interviewing with us.", delayHours: 2, channel: "messenger" },
      { message: "Here are your next steps.", delayHours: 24, channel: "messenger" }
    ],
    transition: "presentation"
  },
  after_presentation: {
    id: "after_presentation",
    trigger: "presentation.completed",
    steps: [
      { message: "Following up on our conversation.", delayHours: 48, channel: "messenger" }
    ],
    transition: "licensing"
  },
  after_no_show: {
    id: "after_no_show",
    trigger: "presentation.no_show",
    steps: [
      { message: "We missed you. Would you like to reschedule?", delayHours: 4, channel: "messenger" }
    ],
    transition: "interview.reschedule"
  },
  after_licensing: {
    id: "after_licensing",
    trigger: "license.started",
    steps: [
      { message: "Study resources are ready.", delayHours: 24, channel: "messenger" }
    ],
    transition: "orientation"
  },
  after_orientation: {
    id: "after_orientation",
    trigger: "orientation.completed",
    steps: [
      { message: "Welcome aboard. Here is your Fast Start checklist.", delayHours: 12, channel: "messenger" }
    ],
    transition: "faststart"
  },
  after_inactivity: {
    id: "after_inactivity",
    trigger: "candidate.inactive",
    steps: [
      { message: "Checking in — are you still interested?", delayHours: 72, channel: "messenger" }
    ],
    transition: null
  }
});

class FollowUpEngine {
  /**
   * @param {Object} deps
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   * @param {Object} [deps.configuration]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.sequences = {
      ...DEFAULT_SEQUENCES,
      ...(deps.configuration?.followUpSequences || {})
    };
    this.active = new Map();
  }

  startSequence(candidateId, sequenceId, context = {}) {
    const sequence = this.sequences[sequenceId];

    if (!sequence) {
      throw new Error(`Unknown follow-up sequence: ${sequenceId}`);
    }

    const run = {
      candidateId,
      sequenceId,
      currentStep: 0,
      context,
      startedAt: new Date().toISOString(),
      status: "active"
    };

    this.active.set(`${candidateId}:${sequenceId}`, run);
    this.eventBus?.emit("package.followup.started", { candidateId, sequenceId });

    return run;
  }

  getNextStep(candidateId, sequenceId) {
    const key = `${candidateId}:${sequenceId}`;
    const run = this.active.get(key);
    const sequence = this.sequences[sequenceId];

    if (!run || !sequence) {
      return null;
    }

    const step = sequence.steps[run.currentStep];

    if (!step) {
      run.status = "completed";
      run.completedAt = new Date().toISOString();
      this.active.set(key, run);
      this.eventBus?.emit("package.followup.completed", { candidateId, sequenceId });
      return null;
    }

    return {
      ...step,
      transition: sequence.transition,
      stepIndex: run.currentStep
    };
  }

  advance(candidateId, sequenceId) {
    const key = `${candidateId}:${sequenceId}`;
    const run = this.active.get(key);

    if (!run) {
      return null;
    }

    run.currentStep += 1;
    this.active.set(key, run);
    return this.getNextStep(candidateId, sequenceId);
  }

  listSequences() {
    return Object.keys(this.sequences);
  }
}

module.exports = {
  FollowUpEngine,
  DEFAULT_SEQUENCES
};
