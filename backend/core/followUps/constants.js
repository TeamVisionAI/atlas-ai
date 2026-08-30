/**
 * BR-178 — Follow-up Engine V2 constants.
 * Durable obligation statuses persist OPEN / COMPLETED / CANCELLED.
 * DUE / OVERDUE are derived on read from due_date vs organization-local today.
 */

const FOLLOW_UP_STATUSES = Object.freeze({
  OPEN: "OPEN",
  DUE: "DUE",
  OVERDUE: "OVERDUE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
});

const FOLLOW_UP_VIEW_STATUSES = Object.freeze({
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  COMPLETED: "completed"
});

const FOLLOW_UP_ENTITY_TYPES = Object.freeze({
  PROSPECT: "prospect",
  APPOINTMENT: "appointment",
  AGENDA_CONTACT: "agenda_contact",
  CLIENT: "client",
  CONVERSATION: "conversation"
});

const FOLLOW_UP_PRIORITIES = Object.freeze({
  NORMAL: "NORMAL",
  HIGH: "HIGH"
});

const FOLLOW_UP_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const FOLLOW_UP_SURFACES = Object.freeze({
  INTERVIEW: "interview",
  AGENDA: "agenda",
  MANUAL: "manual"
});

const OUTCOME_KEYS = Object.freeze({
  FOLLOW_UP: "follow_up",
  NO_SHOW: "no_show",
  NOT_INTERESTED: "not_interested",
  RECRUITED: "recruited",
  CLIENT: "client",
  RESCHEDULED: "rescheduled",
  CANCELLED: "cancelled",
  OTHER: "other"
});

module.exports = {
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_VIEW_STATUSES,
  FOLLOW_UP_ENTITY_TYPES,
  FOLLOW_UP_PRIORITIES,
  FOLLOW_UP_SCOPES,
  FOLLOW_UP_SURFACES,
  OUTCOME_KEYS
};
