/**
 * BR-183 — Client document presentation helpers.
 */

export const DOCUMENT_TYPES = Object.freeze({
  POLICY_DOCUMENT: "POLICY_DOCUMENT",
  APPLICATION: "APPLICATION",
  STATEMENT: "STATEMENT",
  IDENTIFICATION: "IDENTIFICATION",
  BENEFICIARY_FORM: "BENEFICIARY_FORM",
  SERVICE_FORM: "SERVICE_FORM",
  OTHER: "OTHER"
});

export const DOCUMENT_STATUSES = Object.freeze({
  RECEIVED: "RECEIVED",
  REVIEW_PENDING: "REVIEW_PENDING",
  REVIEWED: "REVIEWED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED"
});

export const DOCUMENT_REQUEST_STATUSES = Object.freeze({
  OPEN: "OPEN",
  RECEIVED: "RECEIVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
});

const TYPE_LABEL_KEYS = Object.freeze({
  POLICY_DOCUMENT: "documentsTypePolicy",
  APPLICATION: "documentsTypeApplication",
  STATEMENT: "documentsTypeStatement",
  IDENTIFICATION: "documentsTypeIdentification",
  BENEFICIARY_FORM: "documentsTypeBeneficiary",
  SERVICE_FORM: "documentsTypeServiceForm",
  OTHER: "documentsTypeOther"
});

const DOC_STATUS_KEYS = Object.freeze({
  RECEIVED: "documentsStatusReceived",
  REVIEW_PENDING: "documentsStatusReviewPending",
  REVIEWED: "documentsStatusReviewed",
  REJECTED: "documentsStatusRejected",
  ARCHIVED: "documentsStatusArchived"
});

const REQ_STATUS_KEYS = Object.freeze({
  OPEN: "documentsRequestOpen",
  RECEIVED: "documentsRequestReceived",
  COMPLETED: "documentsRequestCompleted",
  CANCELLED: "documentsRequestCancelled"
});

const DUE_LABEL_KEYS = Object.freeze({
  "needs-date": "serviceDueNeedsDate",
  "due-today": "serviceDueToday",
  overdue: "serviceDueOverdue",
  upcoming: "serviceDueUpcoming",
  closed: "serviceDueClosed"
});

export function buildDocumentTypeLabel(type, translate) {
  return translate(TYPE_LABEL_KEYS[String(type || "").toUpperCase()] || "documentsTypeOther");
}

export function buildDocumentStatusLabel(status, translate) {
  return translate(DOC_STATUS_KEYS[String(status || "").toUpperCase()] || "documentsStatusReceived");
}

export function buildDocumentRequestStatusLabel(status, translate) {
  return translate(REQ_STATUS_KEYS[String(status || "").toUpperCase()] || "documentsRequestOpen");
}

export function buildDocumentDueLabel(dueStatus, translate) {
  return translate(DUE_LABEL_KEYS[String(dueStatus || "")] || "serviceDueNeedsDate");
}

export function documentStatusVariant(status) {
  const value = String(status || "").toUpperCase();
  if (value === "REVIEWED") return "success";
  if (value === "REJECTED") return "danger";
  if (value === "ARCHIVED") return "neutral";
  if (value === "REVIEW_PENDING") return "warning";
  return "info";
}

export function requestStatusVariant(status, dueStatus) {
  const value = String(status || "").toUpperCase();
  if (value === "COMPLETED") return "success";
  if (value === "CANCELLED") return "neutral";
  if (value === "RECEIVED") return "info";
  if (dueStatus === "overdue") return "danger";
  if (dueStatus === "due-today") return "warning";
  return "neutral";
}

export function formatDocumentDate(value, locale = "en-US") {
  if (!value) return null;
  const parsed = Date.parse(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function presentDocumentHistoryEvent(event = {}, translate, locale) {
  return {
    ...event,
    actorLabel: event.actorName || translate("documentsFormerTeammate"),
    atLabel: formatDocumentDate(event.at, locale),
    summary: event.summary || translate("documentsHistoryEvent")
  };
}

export function emptyDocumentRequestForm(overrides = {}) {
  return {
    documentType: DOCUMENT_TYPES.POLICY_DOCUMENT,
    title: "",
    instructions: "",
    dueDate: "",
    serviceCaseId: "",
    dueTime: "",
    notes: "",
    status: DOCUMENT_REQUEST_STATUSES.OPEN,
    ...overrides
  };
}

export function emptyDocumentUploadForm(overrides = {}) {
  return {
    documentType: DOCUMENT_TYPES.OTHER,
    requestId: "",
    serviceCaseId: "",
    notes: "",
    file: null,
    status: DOCUMENT_STATUSES.RECEIVED,
    ...overrides
  };
}
