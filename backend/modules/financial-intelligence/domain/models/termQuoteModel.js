/**
 * Representative-entered Primerica term quote model (RC3).
 * No invented rate tables. No automatic longest-term claims.
 */

const { PREMIUM_SOURCES } = require("../constants");
const { roundCurrency } = require("../adapters/currentIulSnapshotAdapter");

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTermQuote(input = {}) {
  const deathBenefit = asNumber(input.deathBenefit);
  const termDurationYears = asNumber(input.termDurationYears ?? input.selectedTermDuration);
  const monthlyPremium = roundCurrency(asNumber(input.monthlyPremium));
  let premiumSource = String(input.premiumSource || PREMIUM_SOURCES.MISSING).toUpperCase();

  if (!Object.values(PREMIUM_SOURCES).includes(premiumSource)) {
    premiumSource = PREMIUM_SOURCES.MISSING;
  }

  if (monthlyPremium == null || monthlyPremium < 0 || termDurationYears == null) {
    if (premiumSource !== PREMIUM_SOURCES.MISSING && monthlyPremium == null) {
      premiumSource = PREMIUM_SOURCES.MISSING;
    }
  }

  const longestAvailableTermConfirmed = Boolean(input.longestAvailableTermConfirmed);
  const representativeConfirmed =
    input.representativeConfirmed != null
      ? Boolean(input.representativeConfirmed)
      : premiumSource === PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED ||
        premiumSource === PREMIUM_SOURCES.OFFICIAL_QUOTE;

  return Object.freeze({
    deathBenefit,
    selectedTermDuration: termDurationYears,
    monthlyPremium,
    productLabel: input.productLabel ? String(input.productLabel).trim() : null,
    premiumSource,
    quoteDate: input.quoteDate || null,
    representativeConfirmed,
    longestAvailableTermConfirmed,
    eligibilitySource: input.eligibilitySource || null,
    eligibilityConfirmedAt: input.eligibilityConfirmedAt || null,
    notes: input.notes ? String(input.notes).trim() : null,
    missingUnderwritingInformation: Boolean(input.missingUnderwritingInformation),
    isOfficial: premiumSource === PREMIUM_SOURCES.OFFICIAL_QUOTE,
    isPreliminaryEstimate: premiumSource === PREMIUM_SOURCES.PRELIMINARY_ESTIMATE,
    isMissing: premiumSource === PREMIUM_SOURCES.MISSING || monthlyPremium == null
  });
}

module.exports = {
  normalizeTermQuote,
  PREMIUM_SOURCES
};
