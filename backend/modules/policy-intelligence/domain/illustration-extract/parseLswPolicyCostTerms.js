/**
 * National Life / LSW FlexLife II contract-level cost terms (BR-144).
 * Does not reuse Nationwide dual-ledger or rider-charge assumptions.
 */

const {
  createEmptyPolicyCostTerms,
  unavailableValue,
  createProvenance,
  VALUE_CLASSIFICATIONS
} = require("../policy-economics");

const ADAPTER_KEY = "lsw-flexlife-ii-20417FL";

function joined(pages = []) {
  return (pages || []).map((page) => String(page?.text || "")).join("\n");
}

function parseLswPolicyCostTerms(pages = [], parsed = {}) {
  const text = joined(pages);
  const companyDetermined = /will be determined by the company/i.test(text);
  const nullReason = companyDetermined
    ? "rates_determined_by_company_not_printed"
    : "annual_cost_dollars_not_in_illustration";

  const terms = createEmptyPolicyCostTerms({
    adapterKey: ADAPTER_KEY,
    carrier: "National Life Group",
    issuer: "Life Insurance Company of the Southwest",
    product: "FlexLife II",
    nullReason
  });

  const provenance = createProvenance({
    adapterKey: ADAPTER_KEY,
    section: "policy_cost_terms",
    classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
    nullReason
  });

  const named = (category, label) =>
    Object.freeze({
      ...category,
      existenceMentioned: new RegExp(label, "i").test(text),
      rate: unavailableValue(nullReason, provenance),
      annualDollars: unavailableValue(nullReason, provenance),
      notes: companyDetermined ? "named_company_determined" : null
    });

  return Object.freeze({
    ...terms,
    percentOfPremiumExpenseCharge: named(
      terms.percentOfPremiumExpenseCharge,
      "Percent of Premium Expense Charge"
    ),
    costOfInsurance: Object.freeze({
      ...named(terms.costOfInsurance, "Monthly Cost of Insurance"),
      continuationOfCoiEndorsement: null
    }),
    monthlyExpenseCharge: named(terms.monthlyExpenseCharge, "Monthly Expense Charge"),
    monthlyPolicyFee: named(terms.monthlyPolicyFee, "Monthly Policy Fee"),
    monthlyPercentOfAccumulatedValue: named(
      terms.monthlyPercentOfAccumulatedValue,
      "Monthly Percent of Accumulated Value Charge"
    ),
    riderCharges: named(terms.riderCharges, "Rider Charge"),
    surrenderCharges: Object.freeze({
      ...terms.surrenderCharges,
      existenceMentioned: /surrender charge/i.test(text),
      separateFromCsv: true,
      schedule: Object.freeze([]),
      annualDollars: unavailableValue(
        parsed?.surrenderMechanics?.dollarTableAvailable === false
          ? "surrender_term_stated_dollar_table_not_printed"
          : "surrender_charge_dollars_not_in_illustration",
        provenance
      ),
      notes: parsed?.surrenderMechanics
        ? `declining_term_years_${parsed.surrenderMechanics.years || "unknown"}`
        : null
    })
  });
}

module.exports = {
  parseLswPolicyCostTerms,
  ADAPTER_KEY
};
