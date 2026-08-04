/**
 * PI → FI adapter (RC3 / BR-062).
 * Reads Insurance Facts; never mutates PI outputs.
 */

const { ATLAS_TERMS } = require("../../../policy-intelligence/domain/insurance-language/insuranceVocabulary");

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeToMonthlyPremium(amount, frequency) {
  const premium = asNumber(amount);
  if (premium == null || premium < 0) {
    return null;
  }

  const freq = String(frequency || "monthly").trim().toLowerCase();

  if (freq.includes("year") || freq === "annual" || freq === "annually") {
    return premium / 12;
  }
  if (freq.includes("quarter")) {
    return premium / 3;
  }
  if (freq.includes("semi") || freq.includes("half")) {
    return premium / 6;
  }
  if (freq.includes("bi") && freq.includes("week")) {
    return (premium * 26) / 12;
  }
  if (freq.includes("week")) {
    return (premium * 52) / 12;
  }
  // monthly / unknown treated as monthly when amount present
  return premium;
}

function isIulCompatible(productType, product) {
  const text = `${productType || ""} ${product || ""}`.toLowerCase();
  if (!text.trim()) {
    return false;
  }
  return (
    text.includes("iul") ||
    text.includes("indexed") ||
    text.includes(String(ATLAS_TERMS.INDEXED_UNIVERSAL_LIFE || "").toLowerCase()) ||
    text.includes("universal life")
  );
}

function roundCurrency(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Build CurrentIulSnapshot from PI insurance facts (or analysis.insuranceFacts).
 */
function buildCurrentIulSnapshot(facts, { sourceReviewId = null, sourceFactVersion = null } = {}) {
  const missing = [];
  const warnings = [];

  if (!facts || typeof facts !== "object") {
    return {
      ok: false,
      snapshot: null,
      missing: ["insuranceFacts"],
      warnings: ["Policy Intelligence Facts are required."]
    };
  }

  const productType = facts.productType || facts.product || null;
  if (!isIulCompatible(productType, facts.product)) {
    return {
      ok: false,
      snapshot: null,
      missing: ["productType"],
      warnings: [
        "Source policy is not identifiable as an IUL-compatible policy for this strategy evaluation."
      ]
    };
  }

  const originalPremiumAmount = asNumber(facts.premium?.amount);
  const originalPremiumFrequency = facts.premium?.frequency || facts.paymentMode || null;
  const currentMonthlyPremium = roundCurrency(
    normalizeToMonthlyPremium(originalPremiumAmount, originalPremiumFrequency)
  );
  const currentDeathBenefit = asNumber(facts.faceAmount);

  if (currentMonthlyPremium == null) {
    missing.push("premium");
  }
  if (currentDeathBenefit == null || currentDeathBenefit <= 0) {
    missing.push("faceAmount");
  }

  const cashValues = Array.isArray(facts.cashValues) ? facts.cashValues : [];
  const lastCash = cashValues.length ? cashValues[cashValues.length - 1] : null;

  const snapshot = Object.freeze({
    sourceReviewId: sourceReviewId || null,
    productType,
    product: facts.product || null,
    carrier: facts.carrier || null,
    currentMonthlyPremium,
    originalPremiumAmount,
    originalPremiumFrequency,
    currentDeathBenefit,
    issueAge: asNumber(facts.issueAge),
    gender: facts.gender || null,
    riskClassification: facts.riskClassification || null,
    tobaccoStatus: facts.tobaccoStatus || null,
    illustratedDuration: asNumber(facts.illustratedDuration),
    guaranteedDuration: asNumber(facts.guaranteedDuration),
    deathBenefitOption: facts.deathBenefitOption || null,
    cashValueSummary: Object.freeze({
      latestAmount: asNumber(lastCash?.amount),
      rowCount: cashValues.length
    }),
    loanSummary: Object.freeze({
      count: Array.isArray(facts.loans) ? facts.loans.length : 0,
      balances: Array.isArray(facts.loans)
        ? facts.loans.map((loan) => asNumber(loan.balance)).filter((v) => v != null)
        : []
    }),
    riderSummary: Object.freeze({
      count: Array.isArray(facts.riders) ? facts.riders.length : 0,
      types: Array.isArray(facts.riders)
        ? facts.riders.map((rider) => rider.type).filter(Boolean)
        : []
    }),
    sourceFactVersion: sourceFactVersion || facts.extractionId || null,
    capturedAt: new Date().toISOString(),
    piLayer: facts.layer || "insurance_facts",
    factsImmutable: facts.immutable === true
  });

  if (missing.length) {
    warnings.push(
      "Confirm the current monthly IUL premium and death benefit before completing this strategy evaluation."
    );
  }

  return {
    ok: missing.length === 0,
    snapshot,
    missing,
    warnings
  };
}

module.exports = {
  buildCurrentIulSnapshot,
  normalizeToMonthlyPremium,
  isIulCompatible,
  roundCurrency
};
