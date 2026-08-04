/**
 * Pending-verification fund family configuration (RC3).
 * Do not surface symbols as client recommendations until verified.
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
    notes: "Unverified example symbol — not for client recommendation UI."
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
    notes: "Unverified example symbol — not for client recommendation UI."
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
    notes: "Unverified example symbol — not for client recommendation UI."
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
    notes: "Unverified example symbol — not for client recommendation UI."
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
    notes: "Unverified example symbol — not for client recommendation UI."
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
    notes: "Unverified example symbol — not for client recommendation UI."
  }
].map((row) => Object.freeze(row)));

function getFundCatalog() {
  return Object.freeze({
    families: FUND_FAMILIES,
    funds: EXAMPLE_FUNDS,
    uiPolicy: Object.freeze({
      showSymbolsInClientUi: false,
      scenariosUseGeneralCategoriesOnly: true,
      verificationRequiredBeforeRecommendation: true
    })
  });
}

module.exports = {
  FUND_FAMILIES,
  EXAMPLE_FUNDS,
  getFundCatalog
};
