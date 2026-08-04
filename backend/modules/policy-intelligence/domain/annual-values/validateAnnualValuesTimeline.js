/**
 * Deterministic validation for Annual Values timeline (Sprint 4A / BR-060).
 */

const { NUMERIC_ANNUAL_VALUE_FIELDS } = require("./AnnualValue");

function validateAnnualValuesTimeline(timeline = []) {
  const rows = Array.isArray(timeline) ? timeline : [];
  const errors = [];
  const warnings = [];

  if (rows.length === 0) {
    errors.push({
      code: "ANNUAL_VALUES_EMPTY",
      message: "Annual Values timeline is empty."
    });
    return Object.freeze({
      valid: false,
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
      checks: Object.freeze({
        sequentialPolicyYears: false,
        agesIncreaseCorrectly: false,
        premiumsNumericOrNull: true,
        cashValuesNumericOrNull: true,
        deathBenefitsNumericOrNull: true
      })
    });
  }

  let sequentialPolicyYears = true;
  for (let i = 0; i < rows.length; i += 1) {
    const year = rows[i].policyYear;
    if (year == null || !Number.isInteger(year)) {
      sequentialPolicyYears = false;
      errors.push({
        code: "POLICY_YEAR_INVALID",
        message: `Row ${i} has invalid policyYear.`,
        policyYear: year
      });
      continue;
    }

    if (i > 0) {
      const prev = rows[i - 1].policyYear;
      if (year !== prev + 1) {
        sequentialPolicyYears = false;
        errors.push({
          code: "POLICY_YEAR_NOT_SEQUENTIAL",
          message: `Policy years must be sequential: expected ${prev + 1}, found ${year}.`,
          policyYear: year,
          previousPolicyYear: prev
        });
      }
    }
  }

  let agesIncreaseCorrectly = true;
  for (let i = 1; i < rows.length; i += 1) {
    const prevAge = rows[i - 1].insuredAge;
    const age = rows[i].insuredAge;
    if (prevAge == null || age == null) {
      continue;
    }
    const expectedDelta = rows[i].policyYear - rows[i - 1].policyYear;
    if (age !== prevAge + expectedDelta) {
      agesIncreaseCorrectly = false;
      errors.push({
        code: "INSURED_AGE_INCREASE_INVALID",
        message: `Insured age does not increase correctly at policy year ${rows[i].policyYear}.`,
        policyYear: rows[i].policyYear,
        insuredAge: age,
        previousInsuredAge: prevAge
      });
    }
  }

  let premiumsNumericOrNull = true;
  let cashValuesNumericOrNull = true;
  let deathBenefitsNumericOrNull = true;

  for (const row of rows) {
    for (const field of ["annualPremium", "scheduledPremium", "premiumLoad"]) {
      const value = row[field];
      if (value != null && typeof value !== "number") {
        premiumsNumericOrNull = false;
        errors.push({
          code: "PREMIUM_NOT_NUMERIC",
          message: `${field} must be numeric or null.`,
          policyYear: row.policyYear,
          field
        });
      }
    }

    for (const field of ["cashValue", "cashSurrenderValue", "accountValue", "netCashValue"]) {
      const value = row[field];
      if (value != null && typeof value !== "number") {
        cashValuesNumericOrNull = false;
        errors.push({
          code: "CASH_VALUE_NOT_NUMERIC",
          message: `${field} must be numeric or null.`,
          policyYear: row.policyYear,
          field
        });
      }
    }

    if (row.deathBenefit != null && typeof row.deathBenefit !== "number") {
      deathBenefitsNumericOrNull = false;
      errors.push({
        code: "DEATH_BENEFIT_NOT_NUMERIC",
        message: "deathBenefit must be numeric or null.",
        policyYear: row.policyYear
      });
    }

    for (const field of NUMERIC_ANNUAL_VALUE_FIELDS) {
      const value = row[field];
      if (value != null && typeof value !== "number") {
        warnings.push({
          code: "FIELD_NOT_NUMERIC",
          message: `${field} is non-numeric.`,
          policyYear: row.policyYear,
          field
        });
      }
    }
  }

  const valid =
    errors.length === 0 &&
    sequentialPolicyYears &&
    agesIncreaseCorrectly &&
    premiumsNumericOrNull &&
    cashValuesNumericOrNull &&
    deathBenefitsNumericOrNull;

  return Object.freeze({
    valid,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    checks: Object.freeze({
      sequentialPolicyYears,
      agesIncreaseCorrectly,
      premiumsNumericOrNull,
      cashValuesNumericOrNull,
      deathBenefitsNumericOrNull
    })
  });
}

module.exports = {
  validateAnnualValuesTimeline
};
