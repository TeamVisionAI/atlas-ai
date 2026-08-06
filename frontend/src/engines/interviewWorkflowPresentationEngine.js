/**
 * BR-045 — Interview workflow UI presentation (pure UX; no workflow logic changes).
 * Maps read-model signals to consistent labels, action visibility, and hierarchy hints.
 */

import {
  shouldShowCopyZoomLinkAction,
  shouldShowJoinZoomAction,
  shouldShowLifecycleActions,
  shouldShowZoomLinkUnavailableWarning
} from "./appointmentCardPresentation.js";
import { resolvePersistedAppointmentId } from "./appointmentIdEngine.js";

export const INTERVIEW_WORKFLOW_UI_STATES = Object.freeze({
  NONE: "none",
  SCHEDULED: "scheduled",
  IN_PROGRESS: "in_progress",
  RESULT_PENDING: "result_pending",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
  RESCHEDULED: "rescheduled"
});

const OUTCOME_ACTION_IDS = new Set([
  "enter_interview_outcome",
  "record_outcome",
  "record-outcome",
  "record interview outcome"
]);

/** Post-interview communications hidden while outcome gate is active (BR-046.1). */
export const INTERVIEW_RESULT_PENDING_HIDDEN_COMMUNICATION_ACTION_IDS = Object.freeze([
  "send_zoom_link",
  "send_interview_reminder",
  "send_office_location"
]);

export function isCommunicationActionHiddenDuringResultPending(actionId) {
  return INTERVIEW_RESULT_PENDING_HIDDEN_COMMUNICATION_ACTION_IDS.includes(String(actionId || ""));
}

export function resolveInterviewWorkflowStateLabelKey(state) {
  return `interviewWorkflowState_${state}`;
}

export function resolveInterviewWorkflowUiStateFromInterview(interview = {}) {
  const lifecycle = String(interview.lifecycleState || "").toLowerCase();
  const appointmentStatus = String(interview.appointmentStatus || "").toLowerCase();

  if (lifecycle === "cancelled" || appointmentStatus === "cancelled") {
    return INTERVIEW_WORKFLOW_UI_STATES.CANCELLED;
  }

  if (interview.gateActive) {
    return INTERVIEW_WORKFLOW_UI_STATES.RESULT_PENDING;
  }

  if (interview.outcome) {
    const normalized = String(interview.outcome).toLowerCase();

    if (normalized.includes("no show")) {
      return INTERVIEW_WORKFLOW_UI_STATES.NO_SHOW;
    }

    if (normalized.includes("reschedule")) {
      return INTERVIEW_WORKFLOW_UI_STATES.RESCHEDULED;
    }

    return INTERVIEW_WORKFLOW_UI_STATES.COMPLETED;
  }

  if (interview.isPast && interview.datetime) {
    return INTERVIEW_WORKFLOW_UI_STATES.IN_PROGRESS;
  }

  if (interview.datetime || resolvePersistedAppointmentId(interview.appointmentId)) {
    return INTERVIEW_WORKFLOW_UI_STATES.SCHEDULED;
  }

  return INTERVIEW_WORKFLOW_UI_STATES.NONE;
}

export function resolveInterviewWorkflowUiStateFromAppointment(appointment = {}) {
  const status = String(appointment.status || "").toLowerCase();
  const lifecycle = String(appointment.metadata?.lifecycleState || "").toLowerCase();

  if (status === "cancelled" || lifecycle === "cancelled") {
    return INTERVIEW_WORKFLOW_UI_STATES.CANCELLED;
  }

  if (status === "no_show" || lifecycle === "no_show") {
    return INTERVIEW_WORKFLOW_UI_STATES.NO_SHOW;
  }

  if (status === "completed" || lifecycle === "completed") {
    return INTERVIEW_WORKFLOW_UI_STATES.COMPLETED;
  }

  if (status === "rescheduled" || lifecycle === "rescheduled") {
    return INTERVIEW_WORKFLOW_UI_STATES.RESCHEDULED;
  }

  if (status === "in_progress") {
    return INTERVIEW_WORKFLOW_UI_STATES.IN_PROGRESS;
  }

  if (shouldShowLifecycleActions(appointment)) {
    return INTERVIEW_WORKFLOW_UI_STATES.SCHEDULED;
  }

  return INTERVIEW_WORKFLOW_UI_STATES.COMPLETED;
}

export function resolveAppointmentDisplayStatus(appointment = {}) {
  const state = resolveInterviewWorkflowUiStateFromAppointment(appointment);

  switch (state) {
    case INTERVIEW_WORKFLOW_UI_STATES.CANCELLED:
      return "cancelled";
    case INTERVIEW_WORKFLOW_UI_STATES.NO_SHOW:
      return "no_show";
    case INTERVIEW_WORKFLOW_UI_STATES.COMPLETED:
      return "completed";
    case INTERVIEW_WORKFLOW_UI_STATES.RESCHEDULED:
      return "rescheduled";
    case INTERVIEW_WORKFLOW_UI_STATES.IN_PROGRESS:
      return "in_progress";
    default:
      return appointment.status || "scheduled";
  }
}

export function resolveInterviewWorkflowUiStateFromWorkspace(workspace = {}) {
  return resolveInterviewWorkflowUiStateFromInterview(workspace.interview || {});
}

export function filterMissionActionsForInterviewWorkflow(actions = [], workflowGate = null) {
  if (!workflowGate?.active) {
    return actions;
  }

  return actions.filter((action) => {
    const normalized = String(action?.id || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

    return (
      OUTCOME_ACTION_IDS.has(normalized) ||
      normalized.includes("interview_outcome") ||
      normalized.includes("record_outcome")
    );
  });
}

export function resolveRecommendedMissionActionId(actions = [], workflowGate = null) {
  if (!workflowGate?.active) {
    return actions[0]?.id || null;
  }

  const outcomeAction = actions.find((action) => {
    const normalized = String(action?.id || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

    return (
      OUTCOME_ACTION_IDS.has(normalized) ||
      normalized.includes("interview_outcome") ||
      normalized.includes("record_outcome")
    );
  });

  return outcomeAction?.id || actions[0]?.id || null;
}

export function shouldHideCommunicationCard(card = {}) {
  return card.enabled === false;
}

export function resolveAppointmentCardActionPlan(appointment = {}) {
  const state = resolveInterviewWorkflowUiStateFromAppointment(appointment);
  const showJoinZoom = shouldShowJoinZoomAction(appointment);
  const showCopyZoomLink = shouldShowCopyZoomLinkAction(appointment);
  const showZoomLinkUnavailable = shouldShowZoomLinkUnavailableWarning(appointment);
  const showLifecycle = shouldShowLifecycleActions(appointment);

  if (
    state === INTERVIEW_WORKFLOW_UI_STATES.COMPLETED ||
    state === INTERVIEW_WORKFLOW_UI_STATES.CANCELLED ||
    state === INTERVIEW_WORKFLOW_UI_STATES.NO_SHOW
  ) {
    return {
      state,
      showAddNote: false,
      showOpenWorkspace: true,
      openWorkspacePrimary: true,
      openWorkspaceLabelKey: "appointmentsViewWorkspace",
      showCommunicationHistory: true,
      showJoinZoom: false,
      showCopyZoomLink: false,
      showZoomLinkUnavailable: false,
      showReschedule: false,
      showCancel: false,
      showCompleteInterview: false
    };
  }

  return {
    state,
    showAddNote: true,
    showOpenWorkspace: true,
    openWorkspacePrimary: !showJoinZoom,
    openWorkspaceLabelKey: "appointmentsOpenProspect",
    showCommunicationHistory: false,
    showJoinZoom,
    showJoinZoomPrimary: showJoinZoom,
    showCopyZoomLink,
    showZoomLinkUnavailable,
    showReschedule: showLifecycle,
    showCancel: showLifecycle,
    showCompleteInterview: showLifecycle,
    completeInterviewPrimary: false,
    cancelDanger: true
  };
}

export function resolveOperationalInterviewActionPlan(interview = {}, actionVisibility = {}) {
  const state = resolveInterviewWorkflowUiStateFromInterview(interview);

  if (state === INTERVIEW_WORKFLOW_UI_STATES.RESULT_PENDING) {
    return {
      state,
      showPanelActions: false,
      showRecordOutcomeHint: true
    };
  }

  if (
    state === INTERVIEW_WORKFLOW_UI_STATES.COMPLETED ||
    state === INTERVIEW_WORKFLOW_UI_STATES.CANCELLED ||
    state === INTERVIEW_WORKFLOW_UI_STATES.NO_SHOW
  ) {
    return {
      state,
      showPanelActions: false,
      showRecordOutcomeHint: false
    };
  }

  const showActions =
    actionVisibility.showReschedule ||
    actionVisibility.showComplete ||
    actionVisibility.showCancel;

  return {
    state,
    showPanelActions: showActions,
    showRecordOutcomeHint: false,
    showReschedule: actionVisibility.showReschedule,
    showComplete: actionVisibility.showComplete,
    showCancel: actionVisibility.showCancel,
    completePrimary: false,
    rescheduleSecondary: true,
    cancelDanger: true
  };
}
