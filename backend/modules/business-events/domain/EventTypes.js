/**
 * Sprint 14.2 — Centralized Business Event types (BUSINESS_EVENTS.md).
 * No magic strings — import from this module only.
 */

const EVENT_CATEGORIES = Object.freeze({
  LEAD: "lead",
  COMMUNICATION: "communication",
  APPOINTMENT: "appointment",
  RECRUITING: "recruiting",
  SALES: "sales",
  AI: "ai",
  SYSTEM: "system"
});

const LEAD_EVENTS = Object.freeze({
  PROSPECT_CREATED: "prospect_created",
  PROSPECT_UPDATED: "prospect_updated",
  PROSPECT_ARCHIVED: "prospect_archived",
  PROSPECT_MERGED: "prospect_merged",
  PROSPECT_ASSIGNED: "prospect_assigned",
  PROSPECT_RESTORED: "prospect_restored"
});

const COMMUNICATION_EVENTS = Object.freeze({
  MESSAGE_RECEIVED: "message_received",
  MESSAGE_SENT: "message_sent",
  CALL_STARTED: "call_started",
  CALL_COMPLETED: "call_completed",
  EMAIL_SENT: "email_sent",
  EMAIL_OPENED: "email_opened"
});

const APPOINTMENT_EVENTS = Object.freeze({
  APPOINTMENT_CREATED: "appointment_created",
  APPOINTMENT_RESCHEDULED: "appointment_rescheduled",
  REMINDER_SENT: "reminder_sent",
  INTERVIEW_COMPLETED: "interview_completed"
});

const RECRUITING_EVENTS = Object.freeze({
  LICENSE_STARTED: "license_started",
  LICENSE_COMPLETED: "license_completed",
  RECRUIT_JOINED: "recruit_joined",
  PROMOTION_ACHIEVED: "promotion_achieved"
});

const SALES_EVENTS = Object.freeze({
  NEEDS_ANALYSIS_COMPLETED: "needs_analysis_completed",
  POLICY_SUBMITTED: "policy_submitted",
  POLICY_ISSUED: "policy_issued",
  POLICY_DELIVERED: "policy_delivered",
  POLICY_CANCELLED: "policy_cancelled"
});

const AI_EVENTS = Object.freeze({
  AI_RECOMMENDATION_GENERATED: "ai_recommendation_generated",
  AI_SUMMARY_UPDATED: "ai_summary_updated",
  RISK_DETECTED: "risk_detected",
  OPPORTUNITY_DETECTED: "opportunity_detected"
});

const SYSTEM_EVENTS = Object.freeze({
  IMPORT_COMPLETED: "import_completed",
  EXPORT_COMPLETED: "export_completed",
  CONNECTOR_SYNCED: "connector_synced",
  ERROR_LOGGED: "error_logged"
});

const EVENT_TYPES_BY_CATEGORY = Object.freeze({
  [EVENT_CATEGORIES.LEAD]: LEAD_EVENTS,
  [EVENT_CATEGORIES.COMMUNICATION]: COMMUNICATION_EVENTS,
  [EVENT_CATEGORIES.APPOINTMENT]: APPOINTMENT_EVENTS,
  [EVENT_CATEGORIES.RECRUITING]: RECRUITING_EVENTS,
  [EVENT_CATEGORIES.SALES]: SALES_EVENTS,
  [EVENT_CATEGORIES.AI]: AI_EVENTS,
  [EVENT_CATEGORIES.SYSTEM]: SYSTEM_EVENTS
});

const ALL_EVENT_TYPES = Object.freeze(
  Object.values(EVENT_TYPES_BY_CATEGORY).flatMap((group) => Object.values(group))
);

const SYSTEM_EVENTS_WITHOUT_PROSPECT = new Set(Object.values(SYSTEM_EVENTS));

function isKnownEventType(eventType) {
  return ALL_EVENT_TYPES.includes(eventType);
}

function getEventCategory(eventType) {
  for (const [category, events] of Object.entries(EVENT_TYPES_BY_CATEGORY)) {
    if (Object.values(events).includes(eventType)) {
      return category;
    }
  }

  return null;
}

function requiresProspectId(eventType) {
  return !SYSTEM_EVENTS_WITHOUT_PROSPECT.has(eventType);
}

module.exports = {
  EVENT_CATEGORIES,
  LEAD_EVENTS,
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  RECRUITING_EVENTS,
  SALES_EVENTS,
  AI_EVENTS,
  SYSTEM_EVENTS,
  EVENT_TYPES_BY_CATEGORY,
  ALL_EVENT_TYPES,
  isKnownEventType,
  getEventCategory,
  requiresProspectId
};
