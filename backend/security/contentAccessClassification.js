/**
 * BR-074 — Future Content Center access classifications.
 * Enum/policy foundation only — no Content Center UI or SB-72 upload in this milestone.
 */

const CONTENT_ACCESS_CLASS = Object.freeze({
  GENERAL: "GENERAL",
  INSURANCE: "INSURANCE",
  SECURITIES_REGISTERED_ONLY: "SECURITIES_REGISTERED_ONLY",
  SECURITIES_PRINCIPAL_ONLY: "SECURITIES_PRINCIPAL_ONLY",
  COMPLIANCE_ONLY: "COMPLIANCE_ONLY",
  ADMIN_ONLY: "ADMIN_ONLY"
});

const CONTENT_VISIBILITY = Object.freeze({
  INTERNAL_ONLY: "INTERNAL_ONLY",
  SHARED: "SHARED"
});

/** Future SB-72 defaults (do not publish SB-72 in this milestone). */
const SB72_DEFAULT_CLASSIFICATION = Object.freeze({
  accessClass: CONTENT_ACCESS_CLASS.SECURITIES_REGISTERED_ONLY,
  visibility: CONTENT_VISIBILITY.INTERNAL_ONLY
});

const ALL_CONTENT_ACCESS_CLASSES = Object.freeze(Object.values(CONTENT_ACCESS_CLASS));

/**
 * Policy helper for future content gateways.
 * Fail closed for unknown classes and for securities classes without verified access.
 */
function canAccessContentClass(accessClass, { canAccessSecuritiesContent = false, isPrincipal = false, isCompliance = false, isAdmin = false } = {}) {
  const normalized = String(accessClass || "").trim().toUpperCase();

  if (!ALL_CONTENT_ACCESS_CLASSES.includes(normalized)) {
    return false;
  }

  switch (normalized) {
    case CONTENT_ACCESS_CLASS.GENERAL:
    case CONTENT_ACCESS_CLASS.INSURANCE:
      return true;
    case CONTENT_ACCESS_CLASS.SECURITIES_REGISTERED_ONLY:
      return canAccessSecuritiesContent === true;
    case CONTENT_ACCESS_CLASS.SECURITIES_PRINCIPAL_ONLY:
      return canAccessSecuritiesContent === true && isPrincipal === true;
    case CONTENT_ACCESS_CLASS.COMPLIANCE_ONLY:
      return isCompliance === true || isAdmin === true;
    case CONTENT_ACCESS_CLASS.ADMIN_ONLY:
      return isAdmin === true;
    default:
      return false;
  }
}

module.exports = {
  CONTENT_ACCESS_CLASS,
  CONTENT_VISIBILITY,
  SB72_DEFAULT_CLASSIFICATION,
  ALL_CONTENT_ACCESS_CLASSES,
  canAccessContentClass
};
