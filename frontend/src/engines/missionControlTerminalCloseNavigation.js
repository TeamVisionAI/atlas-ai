/**
 * Post-save Mission Control navigation after terminal close (BR-044 Not Interested / CLOSED).
 * Presentation/selection only — queue authority remains backend prioritizedWorkflowQueue.
 */

const TERMINAL_CLOSE_OUTCOMES = new Set([
  "Not Interested",
  "Not Qualified",
  "Already Working with Another Company",
  "Unable to Contact"
]);

const TERMINAL_CLOSE_MILESTONES = new Set(["CLOSED", "DO_NOT_CONTACT", "Closed"]);

export function isTerminalCloseOutcome(outcome) {
  if (!outcome) {
    return false;
  }

  return TERMINAL_CLOSE_OUTCOMES.has(String(outcome).trim());
}

export function isTerminalClosedMilestone(milestone) {
  if (!milestone) {
    return false;
  }

  const value = String(milestone).trim().toUpperCase();
  return value === "CLOSED" || value === "DO_NOT_CONTACT";
}

/**
 * Detects a terminal Mission Control close from conversation/interview outcome save payloads.
 */
export function isTerminalMissionControlCloseResult(result = null) {
  if (!result) {
    return false;
  }

  if (isTerminalCloseOutcome(result.outcome)) {
    return true;
  }

  const missionControl = result.missionControl || result;
  const workflowMilestone =
    missionControl?.workflow?.canonicalMilestone ||
    missionControl?.workflowState?.canonicalMilestone ||
    null;

  if (isTerminalClosedMilestone(workflowMilestone)) {
    return true;
  }

  const agentOutcome =
    missionControl?.brain?.outcome ||
    missionControl?.agentState?.outcome ||
    missionControl?.conversationOutcome?.recordedOutcome?.label ||
    null;

  return isTerminalCloseOutcome(agentOutcome);
}

/**
 * Whether a live MC workspace should hide operational Mission Actions (terminal closed).
 */
export function shouldSuppressOperationalMissionActions(workspace = null) {
  if (!workspace) {
    return false;
  }

  if (isTerminalClosedMilestone(workspace?.workflow?.canonicalMilestone)) {
    return true;
  }

  if (isTerminalClosedMilestone(workspace?.prospect?.canonicalMilestone)) {
    return true;
  }

  if (isTerminalCloseOutcome(workspace?.workflow?.outcome)) {
    return true;
  }

  if (isTerminalCloseOutcome(workspace?.conversationOutcome?.recordedOutcome?.label)) {
    return true;
  }

  return false;
}

/**
 * After removing a closed phone from the operational queue, pick the next selection index.
 * Prefer the prior index (which now points at the following prospect after removal).
 */
export function resolvePostTerminalCloseQueueSelection({
  sortedQueue = [],
  closedPhone = null,
  priorIndex = 0
} = {}) {
  const eligible = (sortedQueue || []).filter(
    (item) => item?.phone && item.phone !== closedPhone
  );

  if (!eligible.length) {
    return {
      eligibleQueue: [],
      nextIndex: null,
      empty: true
    };
  }

  const nextIndex = Math.min(Math.max(priorIndex, 0), eligible.length - 1);

  return {
    eligibleQueue: eligible,
    nextIndex,
    empty: false,
    nextPhone: eligible[nextIndex]?.phone || null
  };
}

export {
  TERMINAL_CLOSE_OUTCOMES,
  TERMINAL_CLOSE_MILESTONES
};
