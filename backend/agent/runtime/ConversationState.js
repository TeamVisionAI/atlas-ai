/**
 * Journey #5 Increment 4 — Conversation session status constants.
 */

const CONVERSATION_STATUS = Object.freeze({
  STARTED: "started",
  ACTIVE: "active",
  COMPLETED: "completed",
  CLOSED: "closed",
  ESCALATED: "escalated"
});

const OUTCOME_TYPE = Object.freeze({
  APPOINTMENT_SCHEDULED: "appointment_scheduled",
  ESCALATED: "escalated",
  INCOMPLETE: "incomplete"
});

module.exports = {
  CONVERSATION_STATUS,
  OUTCOME_TYPE
};
