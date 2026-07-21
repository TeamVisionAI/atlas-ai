/**
 * Journey #5 Increment 4 — Conversation session lifecycle events.
 */

const SessionEvent = Object.freeze({
  STARTED: "conversation.started",
  UPDATED: "conversation.updated",
  RESUMED: "conversation.resumed",
  COMPLETED: "conversation.completed",
  SUMMARY_CREATED: "conversation.summary.created",
  CLOSED: "conversation.closed"
});

module.exports = {
  SessionEvent
};
