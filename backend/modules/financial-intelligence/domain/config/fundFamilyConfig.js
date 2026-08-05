/**
 * NON-PRODUCTION PLACEHOLDER fund family configuration.
 *
 * These example symbols (FELAX, VAFAX, …) are development fixtures only.
 * They are NOT an approved authoritative SB-72 / firm fund catalog.
 *
 * Live APIs, print/export, UI, and AI retrieval must never return this data
 * until canExposeVerifiedFundCatalog() is true for an approved catalog release.
 *
 * Implements product-boundary companion to BR-074 (RC4 M1 hotfix).
 */

const FUND_FAMILIES = Object.freeze(["Fidelity", "Invesco", "Franklin Templeton"]);

const EXAMPLE_FUNDS = Object.freeze([
  {
    symbol: "FELAX",
    fundFamily: "Fidelity",
    fundName: "Example entry — pending verification",
    shareClass: null,
    objective: null,
    assetCategory: null,
    riskClassification: null,
    availabilityStatus: "UNKNOWN",
    verificationStatus: "PENDING_VERIFICATION",
    verificationSource: null,
    effectiveDate: null,
    notes: "NON_PRODUCTION_PLACEHOLDER — not for live API, UI, print, or AI retrieval."
  },
  {
    symbol: "VAFAX",
    fundFamily: "Invesco",
    fundName: "Example entry — pending verification",
    shareClass: null,
    objective: null,
    assetCategory: null,
    riskClassification: null,
    availabilityStatus: "UNKNOWN",
    verificationStatus: "PENDING_VERIFICATION",
    verificationSource: null,
    effectiveDate: null,
    notes: "NON_PRODUCTION_PLACEHOLDER — not for live API, UI, print, or AI retrieval."
  },
  {
    symbol: "VADAX",
    fundFamily: "Invesco",
    fundName: "Example entry — pending verification",
    shareClass: null,
    objective: null,
    assetCategory: null,
    riskClassification: null,
    availabilityStatus: "UNKNOWN",
    verificationStatus: "PENDING_VERIFICATION",
    verificationSource: null,
    effectiveDate: null,
    notes: "NON_PRODUCTION_PLACEHOLDER — not for live API, UI, print, or AI retrieval."
  },
  {
    symbol: "EPGAX",
    fundFamily: "Fidelity",
    fundName: "Example entry — pending verification",
    shareClass: null,
    objective: null,
    assetCategory: null,
    riskClassification: null,
    availabilityStatus: "UNKNOWN",
    verificationStatus: "PENDING_VERIFICATION",
    verificationSource: null,
    effectiveDate: null,
    notes: "NON_PRODUCTION_PLACEHOLDER — not for live API, UI, print, or AI retrieval."
  },
  {
    symbol: "ACEIX",
    fundFamily: "Invesco",
    fundName: "Example entry — pending verification",
    shareClass: null,
    objective: null,
    assetCategory: null,
    riskClassification: null,
    availabilityStatus: "UNKNOWN",
    verificationStatus: "PENDING_VERIFICATION",
    verificationSource: null,
    effectiveDate: null,
    notes: "NON_PRODUCTION_PLACEHOLDER — not for live API, UI, print, or AI retrieval."
  },
  {
    symbol: "SBLGX",
    fundFamily: "Franklin Templeton",
    fundName: "Example entry — pending verification",
    shareClass: null,
    objective: null,
    assetCategory: null,
    riskClassification: null,
    availabilityStatus: "UNKNOWN",
    verificationStatus: "PENDING_VERIFICATION",
    verificationSource: null,
    effectiveDate: null,
    notes: "NON_PRODUCTION_PLACEHOLDER — not for live API, UI, print, or AI retrieval."
  }
].map((row) => Object.freeze(row)));

/**
 * Internal / test-only placeholder catalog. Do not attach to live API responses.
 */
function getNonProductionPlaceholderFundCatalog() {
  return Object.freeze({
    productionAuthorized: false,
    catalogStatus: "NON_PRODUCTION_PLACEHOLDER",
    families: FUND_FAMILIES,
    funds: EXAMPLE_FUNDS,
    uiPolicy: Object.freeze({
      showSymbolsInClientUi: false,
      scenariosUseGeneralCategoriesOnly: true,
      verificationRequiredBeforeRecommendation: true,
      liveApiExposureForbidden: true
    })
  });
}

/** @deprecated Use getNonProductionPlaceholderFundCatalog — not a live catalog. */
function getFundCatalog() {
  return getNonProductionPlaceholderFundCatalog();
}

module.exports = {
  FUND_FAMILIES,
  EXAMPLE_FUNDS,
  getFundCatalog,
  getNonProductionPlaceholderFundCatalog
};
