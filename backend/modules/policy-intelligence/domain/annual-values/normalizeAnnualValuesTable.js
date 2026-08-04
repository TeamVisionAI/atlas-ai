/**
 * Normalize carrier / illustration annual table rows → canonical AnnualValue timeline.
 * Sprint 4A / BR-060 — no OCR, no AI, no invented values.
 */

const { createCanonicalAnnualValue } = require("./AnnualValue");

/** Carrier / illustration column aliases → canonical field. */
const COLUMN_ALIASES = Object.freeze({
  policyYear: [
    "policyYear",
    "policy_year",
    "year",
    "Year",
    "EOY",
    "eoy",
    "endOfYear",
    "End of Year",
    "Policy Year"
  ],
  insuredAge: [
    "insuredAge",
    "insured_age",
    "age",
    "Age",
    "Attained Age",
    "attainedAge",
    "Insured Age"
  ],
  annualPremium: [
    "annualPremium",
    "annual_premium",
    "premium",
    "Premium",
    "Premium Outlay",
    "premiumOutlay",
    "Annual Premium",
    "Planned Premium",
    "plannedPremium"
  ],
  scheduledPremium: [
    "scheduledPremium",
    "scheduled_premium",
    "Scheduled Premium",
    "Target Premium",
    "targetPremium"
  ],
  premiumLoad: [
    "premiumLoad",
    "premium_load",
    "Premium Load",
    "Percent of Premium Charge",
    "percentOfPremiumCharge",
    "Premium Charge"
  ],
  administrativeCharge: [
    "administrativeCharge",
    "administrative_charge",
    "adminCharge",
    "Admin Charge",
    "Administrative Charge",
    "Policy Fee",
    "policyFee",
    "Monthly Admin"
  ],
  costOfInsurance: [
    "costOfInsurance",
    "cost_of_insurance",
    "coi",
    "COI",
    "Cost of Insurance",
    "Cost Of Insurance"
  ],
  riderCharges: [
    "riderCharges",
    "rider_charges",
    "Rider Charges",
    "Rider Charge",
    "Rider Cost",
    "riderCost",
    "Riders"
  ],
  interestCredited: [
    "interestCredited",
    "interest_credited",
    "Interest Credited",
    "Index Credit",
    "indexCredit",
    "Credited Interest",
    "Interest"
  ],
  accountValue: [
    "accountValue",
    "account_value",
    "Account Value",
    "Accumulated Value",
    "accumulatedValue",
    "Accumulation Value"
  ],
  cashValue: [
    "cashValue",
    "cash_value",
    "Cash Value",
    "Cash Accumulation Value",
    "cashAccumulationValue"
  ],
  cashSurrenderValue: [
    "cashSurrenderValue",
    "cash_surrender_value",
    "csv",
    "CSV",
    "Cash Surrender Value",
    "Surrender Value",
    "surrenderValue"
  ],
  deathBenefit: [
    "deathBenefit",
    "death_benefit",
    "Death Benefit",
    "DB",
    "db",
    "Total Death Benefit"
  ],
  loanBalance: [
    "loanBalance",
    "loan_balance",
    "Loan Balance",
    "Loans",
    "loans",
    "Policy Loan",
    "policyLoan"
  ],
  withdrawals: [
    "withdrawals",
    "Withdrawals",
    "Partial Withdrawal",
    "partialWithdrawal",
    "Withdrawal"
  ],
  netCashValue: [
    "netCashValue",
    "net_cash_value",
    "Net Cash Value",
    "Net CSV",
    "netCsv"
  ]
});

function buildAliasLookup() {
  const lookup = new Map();
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      lookup.set(String(alias).trim().toLowerCase(), canonical);
    }
  }
  return lookup;
}

const ALIAS_LOOKUP = buildAliasLookup();

function pickCanonicalFields(row) {
  if (!row || typeof row !== "object") {
    return {};
  }

  const picked = {};

  for (const [key, value] of Object.entries(row)) {
    const canonical = ALIAS_LOOKUP.get(String(key).trim().toLowerCase());
    if (!canonical) {
      continue;
    }
    if (picked[canonical] === undefined || picked[canonical] === null || picked[canonical] === "") {
      picked[canonical] = value;
    }
  }

  return picked;
}

/**
 * Normalize raw illustration annual table into sorted canonical timeline.
 * @param {Array<object>} rows
 * @returns {{ timeline: ReadonlyArray<object>, normalization: object }}
 */
function normalizeAnnualValuesTable(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const timeline = [];

  for (let index = 0; index < sourceRows.length; index += 1) {
    const picked = pickCanonicalFields(sourceRows[index]);
    const canonical = createCanonicalAnnualValue(picked);

    // Rows with no policy year are skipped (cannot place on timeline) — not invented.
    if (canonical.policyYear == null) {
      continue;
    }

    timeline.push(canonical);
  }

  timeline.sort((a, b) => a.policyYear - b.policyYear);

  return {
    timeline: Object.freeze(timeline.map((row) => Object.freeze({ ...row }))),
    normalization: Object.freeze({
      sourceRowCount: sourceRows.length,
      normalizedRowCount: timeline.length,
      skippedRowCount: sourceRows.length - timeline.length,
      engine: "annual_values_engine",
      version: "1.0"
    })
  };
}

module.exports = {
  COLUMN_ALIASES,
  normalizeAnnualValuesTable,
  pickCanonicalFields
};
