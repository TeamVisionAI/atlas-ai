/**
 * Prospect Workspace Interview module — presentation-only helpers.
 * Does not change appointment eligibility or handlers.
 */

import {
  COMMUNICATION_ACTION_IDS,
  APPOINTMENT_COMMUNICATION_ACTION_IDS
} from "./communicationActionStateEngine.js";
import {
  INTERVIEW_MODULE_COMMUNICATION_ORDER,
  WORKSPACE_GENERAL_COMMUNICATION_ORDER,
  buildCommunicationActionCenterCards
} from "./communicationActionCenterPresentation.js";
import { resolveInterviewWorkflowUiStateFromInterview } from "./interviewWorkflowPresentationEngine.js";
import { resolvePersistedAppointmentId } from "./appointmentIdEngine.js";

const MEETING_TYPE_LABELS = Object.freeze({
  in_person: "In Person",
  office: "In Person",
  zoom: "Zoom",
  virtual: "Zoom",
  phone: "Phone",
  phone_call: "Phone"
});

const STATUS_LABELS = Object.freeze({
  scheduled: "Interview Scheduled",
  confirmed: "Interview Scheduled",
  completed: "Interview Completed",
  cancelled: "Interview Cancelled",
  canceled: "Interview Cancelled",
  no_show: "No Show",
  rescheduled: "Rescheduled"
});

export function formatInterviewMeetingTypeLabel(value) {
  if (value == null || value === "") {
    return "—";
  }

  const raw = String(value).trim();
  const key = raw.toLowerCase().replace(/\s+/g, "_");

  if (MEETING_TYPE_LABELS[key]) {
    return MEETING_TYPE_LABELS[key];
  }

  if (key.includes("zoom") || key.includes("virtual")) {
    return "Zoom";
  }

  if (key.includes("person") || key.includes("office")) {
    return "In Person";
  }

  // Avoid leaking snake_case / raw DB enums
  if (raw.includes("_")) {
    return raw
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  return raw;
}

export function formatInterviewStatusLabel(value) {
  if (value == null || value === "") {
    return "—";
  }

  const key = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  return STATUS_LABELS[key] || formatInterviewMeetingTypeLabel(value);
}

export function formatInterviewOutcomeLabel(value) {
  if (value == null || value === "") {
    return "Not recorded";
  }

  const raw = String(value).trim();

  if (!raw || raw === "—" || raw.toLowerCase() === "null") {
    return "Not recorded";
  }

  if (raw.includes("_")) {
    return formatInterviewMeetingTypeLabel(raw);
  }

  return raw;
}

export function shouldRenderScheduledInterviewModule(interview = {}) {
  const state = resolveInterviewWorkflowUiStateFromInterview(interview);

  if (state === "none") {
    return false;
  }

  return Boolean(
    interview?.datetime || resolvePersistedAppointmentId(interview?.appointmentId)
  );
}

export function buildWorkspaceGeneralCommunicationCards({
  phone,
  actions,
  translate,
  includeAddNote = true,
  recommendedActionId = null
}) {
  return buildCommunicationActionCenterCards({
    phone,
    actions,
    translate,
    includeAddNote,
    recommendedActionId,
    order: WORKSPACE_GENERAL_COMMUNICATION_ORDER
  });
}

export function buildInterviewModuleCommunicationCards({
  phone,
  actions,
  translate,
  recommendedActionId = null
}) {
  return buildCommunicationActionCenterCards({
    phone,
    actions,
    translate,
    includeAddNote: false,
    recommendedActionId,
    order: INTERVIEW_MODULE_COMMUNICATION_ORDER
  });
}

export function isAppointmentCommunicationActionId(actionId) {
  return APPOINTMENT_COMMUNICATION_ACTION_IDS.has(String(actionId || ""));
}

export function isGeneralWorkspaceCommunicationActionId(actionId) {
  const id = String(actionId || "");
  return (
    id === "call" ||
    id === "add_note" ||
    id === COMMUNICATION_ACTION_IDS.CUSTOM
  );
}

export {
  WORKSPACE_GENERAL_COMMUNICATION_ORDER,
  INTERVIEW_MODULE_COMMUNICATION_ORDER,
  MEETING_TYPE_LABELS,
  STATUS_LABELS
};
