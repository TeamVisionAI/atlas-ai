/**
 * Fail-closed illustrated-rate stress gate (BR-061).
 * Does not invent IUL projections. Does not modify Atlas Extract adapters.
 */

const { validateAnnualValuesTimeline } = require("../annual-values/validateAnnualValuesTimeline");

const ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE = "ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE";

const STRESS_NOT_COMPUTABLE_MESSAGE =
  "This policy illustration does not provide enough information to accurately recalculate policy values at a different illustrated rate. A carrier-generated illustration is required.";

const REQUIRED_FLOW_FIELDS = Object.freeze([
  ["accountValue", "ACCOUNT_VALUE_UNAVAILABLE"],
  ["annualPremium", "ANNUAL_PREMIUM_UNAVAILABLE"],
  ["interestCredited", "INTEREST_CREDITED_UNAVAILABLE"],
  ["premiumLoad", "PREMIUM_LOAD_UNAVAILABLE"],
  ["administrativeCharge", "ADMINISTRATIVE_CHARGE_UNAVAILABLE"],
  ["costOfInsurance", "COST_OF_INSURANCE_UNAVAILABLE"],
  ["riderCharges", "RIDER_CHARGES_UNAVAILABLE"]
]);

/** AV in this band with large CSV/DB is a rate/percent stored in a currency field. */
const PERCENT_LIKE_AV_MAX = 30;
const LARGE_CURRENCY_MIN = 500;
/** CSV many times AV indicates a column/unit mismatch (not a surrender remainder). */
const CSV_AV_RATIO_MISMATCH_MAX = 20;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function createIllustratedRateStressNotComputableError(reasons = []) {
  const error = new Error(STRESS_NOT_COMPUTABLE_MESSAGE);
  error.statusCode = 422;
  error.publicCode = ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE;
  error.details = Object.freeze({
    classification: "NOT_COMPUTABLE",
    reasons: Object.freeze([...reasons])
  });
  return error;
}

function hasUnitOrColumnMismatch(rows) {
  for (const row of rows) {
    const av = row.accountValue;
    const csv = row.cashSurrenderValue;
    const db = row.deathBenefit;
    if (!isFiniteNumber(av) || av <= 0) {
      continue;
    }
    if (
      av <= PERCENT_LIKE_AV_MAX &&
      ((isFiniteNumber(csv) && csv >= LARGE_CURRENCY_MIN) ||
        (isFiniteNumber(db) && db >= LARGE_CURRENCY_MIN))
    ) {
      return true;
    }
    if (isFiniteNumber(csv) && csv / av > CSV_AV_RATIO_MISMATCH_MAX) {
      return true;
    }
  }
  return false;
}

/**
 * Illustrated-rate stress is computable only when every cash-flow term the
 * current formula uses is an explicit number (including explicit 0).
 */
function evaluateIllustratedRateStressComputability(timeline = []) {
  const reasons = [];
  const rows = Array.isArray(timeline) ? timeline : [];

  if (rows.length < 2) {
    reasons.push("TIMELINE_INSUFFICIENT");
    return Object.freeze({ computable: false, reasons: Object.freeze(reasons) });
  }

  const identity = validateAnnualValuesTimeline(rows);
  if (!identity.valid) {
    reasons.push("TIMELINE_IDENTITY_INVALID");
  }

  for (const [field, reason] of REQUIRED_FLOW_FIELDS) {
    const missing = rows.some((row) => !isFiniteNumber(row[field]));
    if (missing) {
      reasons.push(reason);
    }
  }

  if (hasUnitOrColumnMismatch(rows)) {
    reasons.push("UNIT_OR_COLUMN_MISMATCH");
  }

  const uniqueReasons = [...new Set(reasons)];
  return Object.freeze({
    computable: uniqueReasons.length === 0,
    reasons: Object.freeze(uniqueReasons)
  });
}

function assertIllustratedRateStressComputable(timeline) {
  const result = evaluateIllustratedRateStressComputability(timeline);
  if (!result.computable) {
    throw createIllustratedRateStressNotComputableError(result.reasons);
  }
  return result;
}

function requireExplicitNumber(value, reasonCode) {
  if (!isFiniteNumber(value)) {
    throw createIllustratedRateStressNotComputableError([reasonCode]);
  }
  return value;
}

module.exports = {
  ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE,
  STRESS_NOT_COMPUTABLE_MESSAGE,
  REQUIRED_FLOW_FIELDS,
  evaluateIllustratedRateStressComputability,
  assertIllustratedRateStressComputable,
  createIllustratedRateStressNotComputableError,
  requireExplicitNumber,
  isFiniteNumber
};
