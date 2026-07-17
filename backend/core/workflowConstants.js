/**
 * Sprint 8A.1 — Canonical workflow vocabulary.
 * Single source of truth for milestone IDs, ownership values, priority tiers, and event types.
 * Business decisions stay in engines; UI uses presentation labels via ATLAS_GLOSSARY.md.
 */

/** Canonical milestone IDs (Sprint 8A). */
const MILESTONES = Object.freeze({
  NEW_LEAD: "NEW_LEAD",
  GREETING_SENT: "GREETING_SENT",
  QUALIFICATION: "QUALIFICATION",
  INTERVIEW_READY: "INTERVIEW_READY",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  INTERVIEW_DUE: "INTERVIEW_DUE",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED",
  INTERVIEW_RESULT_PENDING: "INTERVIEW_RESULT_PENDING",
  FOLLOW_UP: "FOLLOW_UP",
  ORIENTATION: "ORIENTATION",
  LICENSING: "LICENSING",
  FAST_START: "FAST_START",
  CLOSED: "CLOSED",
  DO_NOT_CONTACT: "DO_NOT_CONTACT"
});

/** Workflow ownership — who may drive automated progression. */
const OWNERSHIP = Object.freeze({
  ATLAS: "ATLAS",
  AGENT: "AGENT",
  SYSTEM_WAITING: "SYSTEM_WAITING",
  CLOSED: "CLOSED"
});

/** Mission Control queue priority tiers (rank 1 = highest). */
const PRIORITY_TIERS = Object.freeze({
  PENDING_INTERVIEW_RESULTS: 1,
  HUMAN_ESCALATION: 2,
  INTERVIEW_IMMEDIATE: 3,
  FOLLOW_UP_DUE: 4,
  ATLAS_ACTIVE: 5,
  MONITORING: 6
});

/** Structured workflow event types (see docs/EVENT_CATALOG.md). */
const EVENT_TYPES = Object.freeze({
  PROSPECT_CREATED: "ProspectCreated",
  GREETING_SENT: "GreetingSent",
  MESSAGE_RECEIVED: "MessageReceived",
  MESSAGE_SENT: "MessageSent",
  QUALIFICATION_UPDATED: "QualificationUpdated",
  CONVERSATION_STALLED: "ConversationStalled",
  WORKFLOW_OWNERSHIP_CHANGED: "WorkflowOwnershipChanged",
  HUMAN_CALL_STARTED: "HumanCallStarted",
  HUMAN_CALL_COMPLETED: "HumanCallCompleted",
  PROSPECT_ADVANCED: "ProspectAdvanced",
  INTERVIEW_SCHEDULED: "InterviewScheduled",
  INTERVIEW_RESCHEDULED: "InterviewRescheduled",
  INTERVIEW_COMPLETED: "InterviewCompleted",
  INTERVIEW_RESULT_RECORDED: "InterviewResultRecorded",
  FOLLOW_UP_SCHEDULED: "FollowUpScheduled",
  REMINDER_SCHEDULED: "ReminderScheduled",
  REMINDER_SENT: "ReminderSent",
  WORKFLOW_RESUMED: "WorkflowResumed",
  WORKFLOW_PAUSED: "WorkflowPaused",
  PROSPECT_CLOSED: "ProspectClosed",
  DO_NOT_CONTACT_APPLIED: "DoNotContactApplied"
});

const INTERVIEW_SOON_MS = 2 * 60 * 60 * 1000;

module.exports = {
  MILESTONES,
  OWNERSHIP,
  PRIORITY_TIERS,
  EVENT_TYPES,
  INTERVIEW_SOON_MS
};
