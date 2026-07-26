/**
 * @deprecated Sprint 19 — Frontend localStorage is never authoritative for workflow state.
 * Backend agentActionState + workflow read models are the source of truth.
 * This module remains for backward-compatible UI sync only.
 */
import { INTERVIEW_OUTCOMES } from "../types/outcomes";
import { MILESTONES } from "../types/milestones";

const STORAGE_PREFIX = "atlas-workflow";

export function getWorkflowStorageKey(phone) {
  return `${STORAGE_PREFIX}:${phone || "unknown"}`;
}

export function loadWorkflowState(phone) {
  if (!phone || typeof window === "undefined") {
    return createDefaultWorkflowState();
  }

  try {
    const raw = window.localStorage.getItem(getWorkflowStorageKey(phone));
    return raw ? { ...createDefaultWorkflowState(), ...JSON.parse(raw) } : createDefaultWorkflowState();
  } catch {
    return createDefaultWorkflowState();
  }
}

export function saveWorkflowState(phone, state) {
  if (!phone || typeof window === "undefined") {
    return state;
  }

  window.localStorage.setItem(getWorkflowStorageKey(phone), JSON.stringify(state));
  return state;
}

export function createDefaultWorkflowState() {
  return {
    outcome: null,
    milestone: null,
    orientationDate: null,
    orientationTime: null,
    followUpDate: null,
    followUpTime: null,
    rescheduleDate: null,
    rescheduleTime: null,
    rescheduleInterviewType: null,
    notInterestedReason: null,
    futureReminder: null,
    onboardingUnlocked: false,
    orientationScheduled: false
  };
}

/**
 * @deprecated Use workspace.workflowGate from backend Mission Control API.
 * Gate visibility must not be decided from localStorage.
 */
export function shouldShowWorkflowGate(workspaceOrMission) {
  if (workspaceOrMission?.workflowGate?.active !== undefined) {
    return workspaceOrMission.workflowGate.active;
  }

  return Boolean(workspaceOrMission?.workflowGate?.active);
}

export function applyOutcome(outcome, formData = {}) {
  const next = createDefaultWorkflowState();
  next.outcome = outcome;

  switch (outcome) {
    case INTERVIEW_OUTCOMES.RECRUITED:
      next.milestone = formData.orientationDate
        ? MILESTONES.ORIENTATION_SCHEDULED
        : MILESTONES.RECRUITED;
      next.orientationDate = formData.orientationDate || null;
      next.orientationTime = formData.orientationTime || null;
      next.orientationScheduled = Boolean(formData.orientationDate && formData.orientationTime);
      next.onboardingUnlocked = next.orientationScheduled;
      break;

    case INTERVIEW_OUTCOMES.NO_SHOW:
      next.milestone = MILESTONES.FOLLOW_UP;
      break;

    case INTERVIEW_OUTCOMES.RESCHEDULED:
      next.milestone = MILESTONES.INTERVIEW_SCHEDULED;
      next.rescheduleDate = formData.rescheduleDate || null;
      next.rescheduleTime = formData.rescheduleTime || null;
      next.rescheduleInterviewType = formData.rescheduleInterviewType || null;
      next.outcome = null;
      break;

    case INTERVIEW_OUTCOMES.NEEDS_MORE_TIME:
      next.milestone = MILESTONES.FOLLOW_UP;
      next.followUpDate = formData.followUpDate || null;
      next.followUpTime = formData.followUpTime || null;
      break;

    case INTERVIEW_OUTCOMES.NOT_INTERESTED:
      next.milestone = MILESTONES.CLOSED;
      next.notInterestedReason = formData.notInterestedReason || null;
      next.futureReminder = formData.futureReminder || null;
      break;

    default:
      break;
  }

  return next;
}

export const OUTCOME_OPTIONS = Object.values(INTERVIEW_OUTCOMES);
