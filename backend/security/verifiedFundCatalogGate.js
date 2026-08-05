/**
 * BR-074 companion — Named fund catalog release gate.
 *
 * VERIFIED_ACTIVE authorizes access to *approved* securities content, but no
 * named fund catalog is approved or active in the current release.
 *
 * User securities authorization alone is necessary but not sufficient.
 * This gate fails closed until a future authoritative catalog release
 * explicitly activates all readiness conditions.
 */

/**
 * @typedef {object} FundCatalogReleaseState
 * @property {boolean} [featureImplemented]
 * @property {boolean} [activeVersionExists]
 * @property {boolean} [versionApproved]
 * @property {boolean} [sourceVerified]
 * @property {boolean} [effectiveDateCurrent]
 * @property {string|null} [catalogSource]
 * @property {string|null} [catalogVersion]
 */

/**
 * Canonical readiness gate for exposing named fund-catalog content.
 *
 * @param {object} [input]
 * @param {boolean} [input.canAccessSecuritiesContent]
 * @param {FundCatalogReleaseState} [input.catalogRelease]
 * @returns {boolean}
 */
function canExposeVerifiedFundCatalog(input = {}) {
  const canAccess = input.canAccessSecuritiesContent === true;
  const release = input.catalogRelease || getCurrentFundCatalogReleaseState();

  // Necessary: firm-verified securities content access.
  if (!canAccess) {
    return false;
  }

  // Sufficient only when the authoritative catalog release is fully active.
  return (
    release.featureImplemented === true &&
    release.activeVersionExists === true &&
    release.versionApproved === true &&
    release.sourceVerified === true &&
    release.effectiveDateCurrent === true &&
    String(release.catalogSource || "").trim().length > 0 &&
    String(release.catalogVersion || "").trim().length > 0
  );
}

/**
 * Current-release catalog readiness. Fail closed for everyone until a future
 * authoritative SB-72 / verified catalog milestone activates these flags.
 */
function getCurrentFundCatalogReleaseState() {
  return Object.freeze({
    featureImplemented: false,
    activeVersionExists: false,
    versionApproved: false,
    sourceVerified: false,
    effectiveDateCurrent: false,
    catalogSource: null,
    catalogVersion: null,
    status: "NOT_ACTIVE",
    note:
      "VERIFIED_ACTIVE authorizes access to approved securities content, but no named fund catalog is approved or active in the current release."
  });
}

module.exports = {
  canExposeVerifiedFundCatalog,
  getCurrentFundCatalogReleaseState
};
