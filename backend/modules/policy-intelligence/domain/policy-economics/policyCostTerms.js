/**
 * Contract-level policy cost terms for the 7 IUL categories (BR-144).
 * Annual dollars overlay by year only when explicitly sourced.
 */

const { POLICY_COST_CATEGORIES } = require("./policyCostCategories");
const { VALUE_CLASSIFICATIONS } = require("./classifications");
const { unavailableValue } = require("./classifiedValue");
const { createProvenance } = require("./provenance");

function emptyCategoryTerms(category, nullReason, adapterKey) {
  return Object.freeze({
    categoryId: category.id,
    label: category.label,
    rate: unavailableValue(nullReason, createProvenance({
      adapterKey,
      classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
      nullReason,
      section: category.id
    })),
    monthlyDollars: unavailableValue(nullReason, createProvenance({
      adapterKey,
      classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
      nullReason,
      section: category.id
    })),
    annualDollars: unavailableValue(nullReason, createProvenance({
      adapterKey,
      classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
      nullReason,
      section: category.id
    })),
    annualByYear: Object.freeze({}),
    existenceMentioned: false,
    notes: null
  });
}

function createEmptyPolicyCostTerms({
  adapterKey = null,
  carrier = null,
  issuer = null,
  product = null,
  nullReason = "not_stated"
} = {}) {
  return Object.freeze({
    adapterKey,
    carrier,
    issuer,
    product,
    invented: false,
    interpolated: false,
    percentOfPremiumExpenseCharge: emptyCategoryTerms(
      POLICY_COST_CATEGORIES.PERCENT_OF_PREMIUM_EXPENSE_CHARGE,
      nullReason,
      adapterKey
    ),
    costOfInsurance: Object.freeze({
      ...emptyCategoryTerms(POLICY_COST_CATEGORIES.COST_OF_INSURANCE, nullReason, adapterKey),
      continuationOfCoiEndorsement: null
    }),
    monthlyExpenseCharge: emptyCategoryTerms(
      POLICY_COST_CATEGORIES.MONTHLY_EXPENSE_CHARGE,
      nullReason,
      adapterKey
    ),
    monthlyPolicyFee: emptyCategoryTerms(
      POLICY_COST_CATEGORIES.MONTHLY_POLICY_FEE,
      nullReason,
      adapterKey
    ),
    monthlyPercentOfAccumulatedValue: emptyCategoryTerms(
      POLICY_COST_CATEGORIES.MONTHLY_PERCENT_OF_ACCUMULATED_VALUE,
      nullReason,
      adapterKey
    ),
    riderCharges: emptyCategoryTerms(
      POLICY_COST_CATEGORIES.RIDER_CHARGES,
      nullReason,
      adapterKey
    ),
    surrenderCharges: Object.freeze({
      ...emptyCategoryTerms(POLICY_COST_CATEGORIES.SURRENDER_CHARGES, nullReason, adapterKey),
      schedule: Object.freeze([]),
      separateFromCsv: true
    })
  });
}

function overlayAnnualByYear(terms, year) {
  if (!terms || typeof terms !== "object") {
    return unavailableValue("not_stated");
  }
  const byYear = terms.annualByYear && typeof terms.annualByYear === "object"
    ? terms.annualByYear[year]
    : null;
  if (byYear) {
    return byYear;
  }
  return terms.annualDollars || unavailableValue("not_stated");
}

module.exports = {
  createEmptyPolicyCostTerms,
  overlayAnnualByYear
};
