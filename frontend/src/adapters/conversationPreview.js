import { formatAtlasDateTime } from "../utils/dateFormatter";

const CANONICAL_MILESTONE_LABELS = {
  NEW_LEAD: "New Lead",
  GREETING_SENT: "Greeting Sent",
  QUALIFICATION: "Qualifying",
  INTERVIEW_READY: "Interview Ready",
  INTERVIEW_SCHEDULED: "Interview Scheduled",
  INTERVIEW_DUE: "Interview Due",
  INTERVIEW_COMPLETED: "Interview Complete",
  INTERVIEW_RESULT_PENDING: "Interview Result Pending",
  FOLLOW_UP: "Follow Up",
  ORIENTATION: "Orientation",
  LICENSING: "Licensing",
  FAST_START: "Fast Start",
  CLOSED: "Closed",
  DO_NOT_CONTACT: "Do Not Contact"
};

export function formatCanonicalMilestoneLabel(canonicalMilestone) {
  if (!canonicalMilestone) {
    return null;
  }

  return CANONICAL_MILESTONE_LABELS[canonicalMilestone] || canonicalMilestone;
}

export function formatWorkflowOwnershipLabel(ownership) {
  if (!ownership) {
    return null;
  }

  if (ownership === "WAITING_EVENT") {
    return "Waiting Event";
  }

  if (ownership === "AGENT") {
    return "Agent";
  }

  if (ownership === "ATLAS") {
    return "Atlas";
  }

  return ownership;
}

export function buildConversationPreview(latestConversation, dashboardProspect) {
  if (latestConversation?.text) {
    return {
      text: latestConversation.text,
      direction: latestConversation.direction || "unknown",
      timestamp: latestConversation.timestamp
        ? formatAtlasDateTime(new Date(latestConversation.timestamp))
        : null,
      source: "conversation_logs"
    };
  }

  if (dashboardProspect?.last_message) {
    return {
      text: dashboardProspect.last_message,
      direction: "incoming",
      timestamp: null,
      source: "prospect_last_message"
    };
  }

  return {
    text: null,
    direction: null,
    timestamp: null,
    source: null
  };
}
