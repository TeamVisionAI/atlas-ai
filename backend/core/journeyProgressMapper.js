/**
 * Sprint 10.2 — Journey Progress read model (display-only).
 * Maps canonical milestones to recruiting journey steps. No business decisions.
 */

const { MILESTONES } = require("./workflowConstants");

const JOURNEY_STEPS = Object.freeze([
  { key: "lead", milestones: [MILESTONES.NEW_LEAD, MILESTONES.GREETING_SENT] },
  {
    key: "qualify",
    milestones: [MILESTONES.QUALIFICATION, MILESTONES.INTERVIEW_READY]
  },
  {
    key: "interview",
    milestones: [
      MILESTONES.INTERVIEW_SCHEDULED,
      MILESTONES.INTERVIEW_DUE,
      MILESTONES.INTERVIEW_COMPLETED,
      MILESTONES.INTERVIEW_RESULT_PENDING
    ]
  },
  { key: "outcome", milestones: [MILESTONES.FOLLOW_UP] },
  {
    key: "recruit",
    milestones: [MILESTONES.ORIENTATION, MILESTONES.LICENSING, MILESTONES.FAST_START]
  },
  { key: "orientation", milestones: [MILESTONES.ORIENTATION] }
]);

const TERMINAL_MILESTONES = new Set([MILESTONES.CLOSED, MILESTONES.DO_NOT_CONTACT]);

function findStepIndexForMilestone(canonicalMilestone) {
  if (!canonicalMilestone) {
    return 0;
  }

  if (canonicalMilestone === MILESTONES.LICENSING || canonicalMilestone === MILESTONES.FAST_START) {
    return JOURNEY_STEPS.findIndex((step) => step.key === "recruit");
  }

  for (let index = 0; index < JOURNEY_STEPS.length; index += 1) {
    if (JOURNEY_STEPS[index].milestones.includes(canonicalMilestone)) {
      return index;
    }
  }

  return 0;
}

function buildJourneyProgress(canonicalMilestone) {
  const terminalState = TERMINAL_MILESTONES.has(canonicalMilestone) ? canonicalMilestone : null;
  const currentIndex = findStepIndexForMilestone(canonicalMilestone);
  const currentStepKey = JOURNEY_STEPS[currentIndex]?.key || "lead";

  const steps = JOURNEY_STEPS.map((step, index) => {
    let state = "upcoming";

    if (index < currentIndex) {
      state = "complete";
    } else if (index === currentIndex) {
      state = terminalState ? "skipped" : "current";
    }

    return {
      key: step.key,
      state
    };
  });

  return {
    currentStepKey,
    terminalState,
    steps
  };
}

module.exports = {
  JOURNEY_STEPS,
  buildJourneyProgress
};
