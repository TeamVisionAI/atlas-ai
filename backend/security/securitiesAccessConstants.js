/**
 * BR-074 — Firm-Verified Securities Content Access constants.
 */

const SECURITIES_VERIFY_PERMISSION = "securities:verify";

const VERIFICATION_SOURCE = Object.freeze({
  MANUAL_FIRM_VERIFICATION: "MANUAL_FIRM_VERIFICATION",
  /** One-time org bootstrap only — not for normal Admin Users verification. */
  INITIAL_FIRM_AUTHORITY_BOOTSTRAP: "INITIAL_FIRM_AUTHORITY_BOOTSTRAP"
});

/** Firm evidence categories for initial authority bootstrap (manual; no external scrape). */
const BOOTSTRAP_EVIDENCE_SOURCE = Object.freeze({
  INTERNAL_FIRM_REGISTRATION_RECORD: "INTERNAL_FIRM_REGISTRATION_RECORD",
  CRD_DERIVED_FIRM_RECORD: "CRD_DERIVED_FIRM_RECORD",
  BROKERCHECK_CONFIRMATION: "BROKERCHECK_CONFIRMATION",
  WRITTEN_COMPLIANCE_CONFIRMATION: "WRITTEN_COMPLIANCE_CONFIRMATION"
});

const ALL_BOOTSTRAP_EVIDENCE_SOURCES = Object.freeze(Object.values(BOOTSTRAP_EVIDENCE_SOURCE));

const SECURITIES_ACCESS_STATUS = Object.freeze({
  UNKNOWN: "UNKNOWN",
  NOT_REGISTERED: "NOT_REGISTERED",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  VERIFIED_ACTIVE: "VERIFIED_ACTIVE",
  RESTRICTED: "RESTRICTED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  TERMINATED: "TERMINATED"
});

const ALL_SECURITIES_ACCESS_STATUSES = Object.freeze(Object.values(SECURITIES_ACCESS_STATUS));

const SECURITIES_CHANGE_ACTIONS = Object.freeze({
  CREATED: "created",
  UPDATED: "updated",
  VERIFIED: "verified",
  REVOKED: "revoked",
  EXPIRED: "expired",
  RESTRICTED: "restricted",
  SUSPENDED: "suspended",
  TERMINATED: "terminated",
  REVIEWED: "reviewed",
  PENDING: "pending"
});

const SECURITIES_AUDIT_ACTIONS = Object.freeze({
  CREATED: "securities.authorization.created",
  UPDATED: "securities.authorization.updated",
  VERIFIED: "securities.authorization.verified",
  REVOKED: "securities.authorization.revoked",
  EXPIRED: "securities.authorization.expired",
  CONTENT_ACCESS_DENIED: "securities.content_access.denied",
  /** Metadata-only record of controlled initial-authority bootstrap. */
  BOOTSTRAP: "securities.authorization.bootstrap",
  VERIFY_GRANT: "securities.verify_permission.granted"
});

function isCanonicalSecuritiesAccessStatus(value) {
  return ALL_SECURITIES_ACCESS_STATUSES.includes(String(value || ""));
}

module.exports = {
  SECURITIES_VERIFY_PERMISSION,
  VERIFICATION_SOURCE,
  BOOTSTRAP_EVIDENCE_SOURCE,
  ALL_BOOTSTRAP_EVIDENCE_SOURCES,
  SECURITIES_ACCESS_STATUS,
  ALL_SECURITIES_ACCESS_STATUSES,
  SECURITIES_CHANGE_ACTIONS,
  SECURITIES_AUDIT_ACTIONS,
  isCanonicalSecuritiesAccessStatus
};
