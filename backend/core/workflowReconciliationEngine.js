/**
 * Sprint 8A.6 — Time-based workflow state reconciliation on read.
 * Aligns persisted milestones with computed interview timing progression.
 * Does not overwrite human advancement, terminal states, or unrelated milestones.
 */

const { MILESTONES, OWNERSHIP, INTERVIEW_SOON_MS } = require("./workflowConstants");
const { deriveDefaultOwnership } = require("./milestoneMapper");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("./workflowStateStore");
const { emitTimeReconciliationEvents } = require("./workflowReconciliationEvents");

/** Forward-only interview timing transitions eligible for auto-reconciliation. */
const TIME_PROGRESSION_TARGETS = Object.freeze({
  [MILESTONES.INTERVIEW_SCHEDULED]: new Set([
    MILESTONES.INTERVIEW_DUE,
    MILESTONES.INTERVIEW_RESULT_PENDING
  ]),
  [MILESTONES.INTERVIEW_DUE]: new Set([
    MILESTONES.INTERVIEW_RESULT_PENDING,
    MILESTONES.INTERVIEW_COMPLETED
  ]),
  [MILESTONES.INTERVIEW_COMPLETED]: new Set([MILESTONES.INTERVIEW_RESULT_PENDING])
});

const PROTECTED_PERSISTED_MILESTONES = new Set([
  MILESTONES.CLOSED,
  MILESTONES.DO_NOT_CONTACT,
  MILESTONES.ORIENTATION,
  MILESTONES.LICENSING,
  MILESTONES.FAST_START
]);

const EARLY_STALL_MILESTONES = new Set([
  MILESTONES.NEW_LEAD,
  MILESTONES.GREETING_SENT,
  MILESTONES.QUALIFICATION,
  MILESTONES.INTERVIEW_READY
]);

function buildReconcileEpisodeKey(computedMilestone, prospect) {
  const interviewAt = parseInterviewDatetime(prospect);
  const anchor = interviewAt ? new Date(interviewAt).toISOString() : "none";
  return `time:${computedMilestone}:${anchor}`;
}

function isTimeProgressionAllowed(persistedMilestone, computedMilestone) {
  const allowed = TIME_PROGRESSION_TARGETS[persistedMilestone];

  if (!allowed) {
    return false;
  }

  return allowed.has(computedMilestone);
}

function isComputedMilestoneSupportedByTiming(computedMilestone, prospect) {
  const at = parseInterviewDatetime(prospect);
  const now = Date.now();

  if (computedMilestone === MILESTONES.INTERVIEW_RESULT_PENDING) {
    return at !== null && at < now;
  }

  if (computedMilestone === MILESTONES.INTERVIEW_DUE) {
    return at !== null && at >= now && at - now <= INTERVIEW_SOON_MS;
  }

  if (computedMilestone === MILESTONES.INTERVIEW_COMPLETED) {
    return at !== null && at < now;
  }

  return true;
}

function shouldReconcile({ persisted, computedMilestone, agentState, prospect }) {
  if (!persisted?.canonicalMilestone || !computedMilestone) {
    return false;
  }

  if (persisted.canonicalMilestone === computedMilestone) {
    return false;
  }

  if (agentState?.outcome) {
    return false;
  }

  if (persisted.doNotContact) {
    return false;
  }

  if (PROTECTED_PERSISTED_MILESTONES.has(persisted.canonicalMilestone)) {
    return false;
  }

  if (
    persisted.canonicalMilestone === MILESTONES.FOLLOW_UP &&
    (agentState?.outcome === "Needs More Time" || agentState?.outcome === "No Show")
  ) {
    return false;
  }

  if (
    persisted.needsHumanAttention &&
    persisted.manualAgentOwnership &&
    EARLY_STALL_MILESTONES.has(persisted.canonicalMilestone)
  ) {
    return false;
  }

  return isTimeProgressionAllowed(persisted.canonicalMilestone, computedMilestone) &&
    isComputedMilestoneSupportedByTiming(computedMilestone, prospect);
}

/**
 * Reconciles persisted workflow state when interview timing advances the computed milestone.
 * Emits transition events once per reconcileEpisodeKey (idempotent on repeated reads).
 */
async function applyTimeBasedReconciliation({
  phone,
  computedMilestone,
  computedOwnership,
  prospect,
  agentState = {}
}) {
  const persisted = loadPersistedWorkflowState(phone);

  if (
    !shouldReconcile({
      persisted,
      computedMilestone,
      agentState,
      prospect
    })
  ) {
    return {
      applied: false,
      milestone: persisted.canonicalMilestone || computedMilestone,
      ownership:
        persisted.workflowOwnership ||
        computedOwnership ||
        deriveDefaultOwnership(computedMilestone, agentState)
    };
  }

  const milestoneAfter = computedMilestone;
  const ownershipAfter = deriveDefaultOwnership(milestoneAfter, agentState);
  const episodeKey = buildReconcileEpisodeKey(milestoneAfter, prospect);
  const ownershipBefore =
    persisted.workflowOwnership ||
    computedOwnership ||
    deriveDefaultOwnership(persisted.canonicalMilestone, agentState);

  const shouldEmitEvents = persisted.reconcileEpisodeKey !== episodeKey;

  savePersistedWorkflowState(phone, {
    canonicalMilestone: milestoneAfter,
    workflowOwnership: ownershipAfter,
    reconcileEpisodeKey: episodeKey,
    needsHumanAttention:
      milestoneAfter === MILESTONES.INTERVIEW_RESULT_PENDING
        ? false
        : persisted.needsHumanAttention,
    manualAgentOwnership:
      milestoneAfter === MILESTONES.INTERVIEW_RESULT_PENDING
        ? false
        : persisted.manualAgentOwnership
  });

  if (shouldEmitEvents) {
    await emitTimeReconciliationEvents({
      phone,
      milestoneBefore: persisted.canonicalMilestone,
      milestoneAfter,
      ownershipBefore,
      ownershipAfter,
      episodeKey
    });
  }

  return {
    applied: true,
    milestone: milestoneAfter,
    ownership: ownershipAfter,
    eventsEmitted: shouldEmitEvents
  };
}

module.exports = {
  applyTimeBasedReconciliation,
  buildReconcileEpisodeKey,
  shouldReconcile,
  isTimeProgressionAllowed,
  TIME_PROGRESSION_TARGETS
};
