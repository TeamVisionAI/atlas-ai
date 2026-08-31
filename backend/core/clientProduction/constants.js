/**
 * BR-181 — Client Production / Activity V1 constants.
 * Production records belong to clients, not recruiting prospects.
 */

const PRODUCTION_ACTIVITY_TYPES = Object.freeze({
  LIFE: "LIFE",
  INVESTMENT: "INVESTMENT",
  ANNUITY: "ANNUITY",
  POLICY_REVIEW: "POLICY_REVIEW",
  OTHER: "OTHER"
});

const PRODUCTION_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PENDING: "PENDING",
  ISSUED: "ISSUED",
  PAID: "PAID",
  DECLINED: "DECLINED",
  WITHDRAWN: "WITHDRAWN",
  CLOSED: "CLOSED"
});

const PRODUCTION_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const PRODUCTION_SOURCES = Object.freeze({
  MANUAL: "MANUAL",
  AGENDA_CLIENT_CONVERSION: "AGENDA_CLIENT_CONVERSION"
});

const PRODUCTION_KPI_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team",
  ORGANIZATION: "organization",
  PLATFORM: "platform"
});

const CLIENT_CONVERSION_STATUSES = Object.freeze({
  INCOMPLETE: "incomplete",
  COMPLETE: "complete"
});

const PRODUCTION_HISTORY_TYPES = Object.freeze({
  CREATED: "created",
  STATUS_CHANGED: "status_changed",
  AMOUNT_CHANGED: "amount_changed",
  CARRIER_PRODUCT_CHANGED: "carrier_product_changed",
  NOTES_CHANGED: "notes_changed"
});

const PRODUCTION_METRIC_STATUSES = Object.freeze([
  PRODUCTION_STATUSES.SUBMITTED,
  PRODUCTION_STATUSES.PENDING,
  PRODUCTION_STATUSES.ISSUED,
  PRODUCTION_STATUSES.PAID
]);

module.exports = {
  PRODUCTION_ACTIVITY_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_SCOPES,
  PRODUCTION_SOURCES,
  PRODUCTION_KPI_SCOPES,
  CLIENT_CONVERSION_STATUSES,
  PRODUCTION_HISTORY_TYPES,
  PRODUCTION_METRIC_STATUSES
};
