/**
 * BR-182 — Client Service presentation helpers.
 */

export const SERVICE_TYPES = Object.freeze({
  POLICY_REVIEW: "POLICY_REVIEW",
  ANNUAL_REVIEW: "ANNUAL_REVIEW",
  BENEFICIARY_UPDATE: "BENEFICIARY_UPDATE",
  DOCUMENT_REQUEST: "DOCUMENT_REQUEST",
  SERVICE_FOLLOW_UP: "SERVICE_FOLLOW_UP",
  GENERAL_SERVICE: "GENERAL_SERVICE",
  OTHER: "OTHER"
});

export const SERVICE_STATUSES = Object.freeze({
  OPEN: "OPEN",
  WAITING_ON_CLIENT: "WAITING_ON_CLIENT",
  WAITING_ON_AGENT: "WAITING_ON_AGENT",
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
});

const TYPE_LABEL_KEYS = Object.freeze({
  POLICY_REVIEW: "serviceTypePolicyReview",
  ANNUAL_REVIEW: "serviceTypeAnnualReview",
  BENEFICIARY_UPDATE: "serviceTypeBeneficiaryUpdate",
  DOCUMENT_REQUEST: "serviceTypeDocumentRequest",
  SERVICE_FOLLOW_UP: "serviceTypeServiceFollowUp",
  GENERAL_SERVICE: "serviceTypeGeneral",
  OTHER: "serviceTypeOther"
});

const STATUS_LABEL_KEYS = Object.freeze({
  OPEN: "serviceStatusOpen",
  WAITING_ON_CLIENT: "serviceStatusWaitingClient",
  WAITING_ON_AGENT: "serviceStatusWaitingAgent",
  SCHEDULED: "serviceStatusScheduled",
  COMPLETED: "serviceStatusCompleted",
  CANCELLED: "serviceStatusCancelled"
});

const DUE_LABEL_KEYS = Object.freeze({
  "needs-date": "serviceDueNeedsDate",
  "due-today": "serviceDueToday",
  overdue: "serviceDueOverdue",
  upcoming: "serviceDueUpcoming",
  closed: "serviceDueClosed"
});

export function buildServiceTypeLabel(type, translate) {
  const key = TYPE_LABEL_KEYS[String(type || "").toUpperCase()] || "serviceTypeGeneral";
  return translate(key);
}

export function buildServiceStatusLabel(status, translate) {
  const key = STATUS_LABEL_KEYS[String(status || "").toUpperCase()] || "serviceStatusOpen";
  return translate(key);
}

export function buildServiceDueLabel(dueStatus, translate) {
  const key = DUE_LABEL_KEYS[String(dueStatus || "")] || "serviceDueNeedsDate";
  return translate(key);
}

export function serviceStatusVariant(status, dueStatus) {
  if (String(status || "").toUpperCase() === "COMPLETED") return "success";
  if (String(status || "").toUpperCase() === "CANCELLED") return "neutral";
  if (dueStatus === "overdue") return "danger";
  if (dueStatus === "due-today") return "warning";
  if (String(status || "").toUpperCase() === "SCHEDULED") return "info";
  return "neutral";
}

export function formatServiceDate(value, locale = "en-US") {
  if (!value) return null;
  const parsed = Date.parse(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function presentServiceHistoryEvent(event = {}, translate, locale) {
  return {
    ...event,
    actorLabel: event.actorName || translate("serviceFormerTeammate"),
    atLabel: formatServiceDate(event.at, locale),
    summary: event.summary || translate("serviceHistoryEvent")
  };
}

export function emptyServiceForm(overrides = {}) {
  return {
    clientId: "",
    serviceType: SERVICE_TYPES.GENERAL_SERVICE,
    status: SERVICE_STATUSES.OPEN,
    title: "",
    notes: "",
    dueDate: "",
    scheduledAppointmentId: "",
    dueTime: "",
    ...overrides
  };
}
