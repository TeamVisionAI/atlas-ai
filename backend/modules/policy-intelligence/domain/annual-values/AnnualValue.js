/**
 * Canonical AnnualValue entity (Sprint 4A / BR-060).
 * Timeline row for an insurance illustration — not an Insurance Fact.
 */

const ANNUAL_VALUE_FIELDS = Object.freeze([
  "policyYear",
  "insuredAge",
  "annualPremium",
  "scheduledPremium",
  "premiumLoad",
  "administrativeCharge",
  "costOfInsurance",
  "riderCharges",
  "interestCredited",
  "accountValue",
  "cashValue",
  "cashSurrenderValue",
  "deathBenefit",
  "loanBalance",
  "withdrawals",
  "netCashValue"
]);

const NUMERIC_ANNUAL_VALUE_FIELDS = Object.freeze(
  ANNUAL_VALUE_FIELDS.filter((field) => field !== "policyYear" && field !== "insuredAge")
);

function asNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "").replace(/[()]/g, (match) =>
      match === "(" ? "-" : ""
    );
    if (!cleaned || cleaned === "-" || cleaned === "—") {
      return null;
    }
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asNullableInteger(value) {
  const number = asNullableNumber(value);
  if (number === null) {
    return null;
  }
  return Math.trunc(number);
}

/**
 * Build one canonical AnnualValue row.
 * Missing values become null — never guessed.
 * netCashValue may be derived when cashValue is present (loanBalance defaults to 0 only for that derivation).
 */
function createCanonicalAnnualValue(input = {}, { deriveNetCashValue = true } = {}) {
  const source = input && typeof input === "object" ? input : {};

  const cashValue = asNullableNumber(source.cashValue);
  const loanBalance = asNullableNumber(source.loanBalance);
  let netCashValue = asNullableNumber(source.netCashValue);

  if (deriveNetCashValue && netCashValue === null && cashValue !== null) {
    netCashValue = cashValue - (loanBalance ?? 0);
  }

  return Object.freeze({
    policyYear: asNullableInteger(source.policyYear),
    insuredAge: asNullableInteger(source.insuredAge),
    annualPremium: asNullableNumber(source.annualPremium),
    scheduledPremium: asNullableNumber(source.scheduledPremium),
    premiumLoad: asNullableNumber(source.premiumLoad),
    administrativeCharge: asNullableNumber(source.administrativeCharge),
    costOfInsurance: asNullableNumber(source.costOfInsurance),
    riderCharges: asNullableNumber(source.riderCharges),
    interestCredited: asNullableNumber(source.interestCredited),
    accountValue: asNullableNumber(source.accountValue),
    cashValue,
    cashSurrenderValue: asNullableNumber(source.cashSurrenderValue),
    deathBenefit: asNullableNumber(source.deathBenefit),
    loanBalance,
    withdrawals: asNullableNumber(source.withdrawals),
    netCashValue
  });
}

function createEmptyAnnualValue() {
  return createCanonicalAnnualValue({});
}

module.exports = {
  ANNUAL_VALUE_FIELDS,
  NUMERIC_ANNUAL_VALUE_FIELDS,
  createCanonicalAnnualValue,
  createEmptyAnnualValue,
  asNullableNumber,
  asNullableInteger
};
