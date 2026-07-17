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
 * Gate: interview time passed AND outcome is null → block workspace.
 * Accepts adapted workspace model or legacy { brain, conversation } shape.
 */
export function shouldShowWorkflowGate(workspaceOrMission, dashboardProspect, workflowState) {
  const brain = workspaceOrMission?.brain;
  const conversation =
    workspaceOrMission?.conversation ||
    (dashboardProspect
      ? {
          interviewTime: dashboardProspect.interview_time,
          appointmentDate: dashboardProspect.appointment_date
        }
      : null);

  if (workflowState.outcome) {
    return false;
  }

  if (brain?.currentStep !== "CONFIRMED") {
    return false;
  }

  return isInterviewTimePassed(conversation);
}

function isInterviewTimePassed(conversation) {
  const interviewTime = conversation?.interviewTime;
  const appointmentDate = conversation?.appointmentDate;

  if (interviewTime) {
    const parsedInterview = Date.parse(interviewTime);

    if (!Number.isNaN(parsedInterview)) {
      return parsedInterview < Date.now();
    }
  }

  if (appointmentDate) {
    const parsedAppointment = Date.parse(appointmentDate);

    if (!Number.isNaN(parsedAppointment)) {
      return parsedAppointment < Date.now();
    }
  }

  if (!interviewTime && !appointmentDate) {
    return true;
  }

  return true;
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
