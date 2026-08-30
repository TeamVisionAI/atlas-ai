/**
 * BR-183 — Client Documents & Secure Document Requests V1 constants.
 * Metadata and request workflow only. No OCR, extraction, or policy analysis.
 */

const DOCUMENT_TYPES = Object.freeze({
  POLICY_DOCUMENT: "POLICY_DOCUMENT",
  APPLICATION: "APPLICATION",
  STATEMENT: "STATEMENT",
  IDENTIFICATION: "IDENTIFICATION",
  BENEFICIARY_FORM: "BENEFICIARY_FORM",
  SERVICE_FORM: "SERVICE_FORM",
  OTHER: "OTHER"
});

const DOCUMENT_STATUSES = Object.freeze({
  RECEIVED: "RECEIVED",
  REVIEW_PENDING: "REVIEW_PENDING",
  REVIEWED: "REVIEWED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED"
});

const DOCUMENT_REQUEST_STATUSES = Object.freeze({
  OPEN: "OPEN",
  RECEIVED: "RECEIVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
});

const DOCUMENT_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const DOCUMENT_DUE_FILTERS = Object.freeze({
  ALL: "all",
  NEEDS_DATE: "needs-date",
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  OPEN: "open"
});

const DOCUMENT_DUE_STATUSES = Object.freeze({
  NEEDS_DATE: "needs-date",
  DUE_TODAY: "due-today",
  OVERDUE: "overdue",
  UPCOMING: "upcoming",
  CLOSED: "closed"
});

const DOCUMENT_HISTORY_TYPES = Object.freeze({
  REQUEST_CREATED: "request_created",
  REQUEST_STATUS_CHANGED: "request_status_changed",
  REQUEST_FULFILLED: "request_fulfilled",
  DOCUMENT_UPLOADED: "document_uploaded",
  DOCUMENT_LINKED: "document_linked",
  DOCUMENT_STATUS_CHANGED: "document_status_changed",
  DOCUMENT_REVIEWED: "document_reviewed",
  DOCUMENT_REJECTED: "document_rejected",
  DOCUMENT_ARCHIVED: "document_archived",
  DOCUMENT_DOWNLOADED: "document_downloaded",
  NOTES_CHANGED: "notes_changed",
  DUE_DATE_CHANGED: "due_date_changed",
  TITLE_CHANGED: "title_changed"
});

const DOCUMENT_REQUEST_CLOSED_STATUSES = Object.freeze([
  DOCUMENT_REQUEST_STATUSES.COMPLETED,
  DOCUMENT_REQUEST_STATUSES.CANCELLED
]);

const CLIENT_DOCUMENT_BUCKET = "client-documents";
const MAX_CLIENT_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CLIENT_DOCUMENT_MIME_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);
const ALLOWED_CLIENT_DOCUMENT_EXTENSIONS = Object.freeze({
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png"
});

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_REQUEST_STATUSES,
  DOCUMENT_SCOPES,
  DOCUMENT_DUE_FILTERS,
  DOCUMENT_DUE_STATUSES,
  DOCUMENT_HISTORY_TYPES,
  DOCUMENT_REQUEST_CLOSED_STATUSES,
  CLIENT_DOCUMENT_BUCKET,
  MAX_CLIENT_DOCUMENT_BYTES,
  ALLOWED_CLIENT_DOCUMENT_MIME_TYPES,
  ALLOWED_CLIENT_DOCUMENT_EXTENSIONS
};
