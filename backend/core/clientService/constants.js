/**
 * BR-182 — Client Service / Policy Review V1 constants.
 * Service cases belong to clients, not recruiting prospects or production statuses.
 */

const SERVICE_TYPES = Object.freeze({
  POLICY_REVIEW: "POLICY_REVIEW",
  ANNUAL_REVIEW: "ANNUAL_REVIEW",
  BENEFICIARY_UPDATE: "BENEFICIARY_UPDATE",
  DOCUMENT_REQUEST: "DOCUMENT_REQUEST",
  SERVICE_FOLLOW_UP: "SERVICE_FOLLOW_UP",
  GENERAL_SERVICE: "GENERAL_SERVICE",
  OTHER: "OTHER"
});

const SERVICE_STATUSES = Object.freeze({
  OPEN: "OPEN",
  WAITING_ON_CLIENT: "WAITING_ON_CLIENT",
  WAITING_ON_AGENT: "WAITING_ON_AGENT",
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
});

const SERVICE_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const SERVICE_DUE_FILTERS = Object.freeze({
  ALL: "all",
  NEEDS_DATE: "needs-date",
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  OPEN: "open"
});

const SERVICE_DUE_STATUSES = Object.freeze({
  NEEDS_DATE: "needs-date",
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  CLOSED: "closed"
});

const SERVICE_HISTORY_TYPES = Object.freeze({
  CREATED: "created",
  STATUS_CHANGED: "status_changed",
  DUE_DATE_CHANGED: "due_date_changed",
  TITLE_CHANGED: "title_changed",
  NOTES_CHANGED: "notes_changed",
  APPOINTMENT_LINKED: "appointment_linked",
  APPOINTMENT_UNLINKED: "appointment_unlinked",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

const SERVICE_CLOSED_STATUSES = Object.freeze([
  SERVICE_STATUSES.COMPLETED,
  SERVICE_STATUSES.CANCELLED
]);

module.exports = {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  SERVICE_SCOPES,
  SERVICE_DUE_FILTERS,
  SERVICE_DUE_STATUSES,
  SERVICE_HISTORY_TYPES,
  SERVICE_CLOSED_STATUSES
};
