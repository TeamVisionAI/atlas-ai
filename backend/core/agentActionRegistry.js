/**
 * Shared Agent Action metadata — single source for action ids and display labels.
 * Used by AgentActionEngine, Mission Engine, and AI Action Center.
 */

const ACTION_IDS = Object.freeze({
  CALL: "call",
  WHATSAPP: "whatsapp",
  SEND_ZOOM_LINK: "send_zoom_link",
  SEND_OFFICE_LOCATION: "send_office_location",
  SCHEDULE: "schedule",
  RESCHEDULE: "reschedule",
  NOTES: "notes",
  SEND_MISSED_APPOINTMENT: "send_missed_appointment",
  LOG_WHATSAPP_OPEN: "log_whatsapp_open",
  ENTER_INTERVIEW_OUTCOME: "enter_interview_outcome",
  ESCALATE_TO_RECRUITER: "escalate_to_recruiter"
});

const AGENT_ACTION_METADATA = Object.freeze({
  [ACTION_IDS.CALL]: { label: "Call prospect" },
  [ACTION_IDS.WHATSAPP]: { label: "Send via WhatsApp" },
  [ACTION_IDS.SEND_ZOOM_LINK]: { label: "Send via WhatsApp" },
  [ACTION_IDS.SEND_OFFICE_LOCATION]: { label: "Send office location" },
  [ACTION_IDS.SCHEDULE]: { label: "Schedule interview" },
  [ACTION_IDS.RESCHEDULE]: { label: "Reschedule interview" },
  [ACTION_IDS.NOTES]: { label: "Add agent notes" },
  [ACTION_IDS.SEND_MISSED_APPOINTMENT]: { label: "Send missed appointment follow-up" },
  [ACTION_IDS.LOG_WHATSAPP_OPEN]: { label: "Continue on WhatsApp" },
  [ACTION_IDS.ENTER_INTERVIEW_OUTCOME]: { label: "Record outcome" },
  [ACTION_IDS.ESCALATE_TO_RECRUITER]: { label: "Escalate to recruiter" }
});

function getAgentActionLabel(actionId) {
  if (!actionId) {
    return "Review conversation";
  }

  return (
    AGENT_ACTION_METADATA[actionId]?.label ||
    String(actionId).replace(/_/g, " ")
  );
}

function buildAvailableAction(id, priority) {
  return {
    id,
    label: getAgentActionLabel(id),
    priority
  };
}

function toMissionAction(action) {
  return {
    id: action.id,
    label: action.label || getAgentActionLabel(action.id),
    priority: action.priority || "secondary"
  };
}

module.exports = {
  ACTION_IDS,
  AGENT_ACTION_METADATA,
  getAgentActionLabel,
  buildAvailableAction,
  toMissionAction
};
