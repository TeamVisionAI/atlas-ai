/**
 * Nationwide IUL Protector II contract-level cost terms (BR-144).
 * Does not parse the annual ledger. Does not invent COI from AV/CSV.
 * Does not reuse National Life / LSW assumptions.
 */

const {
  VALUE_CLASSIFICATIONS,
  createEmptyPolicyCostTerms,
  extractedExact,
  calculatedFromExplicitTerms,
  unavailableValue,
  createProvenance
} = require("../policy-economics");
const { parseSurrenderChargeSchedule } = require("./parseIulIllustrationTables");

const ADAPTER_KEY = "nationwide-iul";

function joined(pages = []) {
  return (pages || []).map((page) => String(page?.text || "")).join("\n");
}

function pageForPattern(pages, pattern) {
  for (const page of pages || []) {
    if (pattern.test(String(page?.text || ""))) {
      return page.page;
    }
  }
  return null;
}

function parseExplicitCoiTable(pages = []) {
  const annualByYear = {};
  let found = false;
  let classification = VALUE_CLASSIFICATIONS.NOT_AVAILABLE;

  for (const page of pages || []) {
    const text = String(page?.text || "");
    const monthlyHeader = /cost of insurance/i.test(text) && /monthly coi/i.test(text);
    const annualHeader = /cost of insurance/i.test(text) && /annual coi/i.test(text);
    if (!monthlyHeader && !annualHeader) {
      continue;
    }
    const matches = text.matchAll(
      /(?:^|\n)\s*(\d{1,3})\s+\$?([0-9,]+(?:\.\d{1,2})?)/g
    );
    for (const match of matches) {
      const year = Number(match[1]);
      const amount = Number(String(match[2]).replace(/,/g, ""));
      if (!Number.isInteger(year) || year < 1 || year > 121 || !Number.isFinite(amount)) {
        continue;
      }
      if (monthlyHeader && !annualHeader) {
        annualByYear[year] = calculatedFromExplicitTerms(
          amount * 12,
          createProvenance({
            sourcePage: page.page,
            adapterKey: ADAPTER_KEY,
            table: "monthly_coi_table",
            section: "cost_of_insurance",
            classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
            sourceText: match[0]
          })
        );
        classification = VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS;
      } else {
        annualByYear[year] = extractedExact(
          amount,
          createProvenance({
            sourcePage: page.page,
            adapterKey: ADAPTER_KEY,
            table: "annual_coi_table",
            section: "cost_of_insurance",
            classification: VALUE_CLASSIFICATIONS.EXTRACTED_EXACT,
            sourceText: match[0]
          })
        );
        classification = VALUE_CLASSIFICATIONS.EXTRACTED_EXACT;
      }
      found = true;
    }
  }

  return { found, annualByYear, classification };
}

function parseNationwidePolicyCosts(pages = []) {
  const text = joined(pages);
  const terms = createEmptyPolicyCostTerms({
    adapterKey: ADAPTER_KEY,
    carrier: "Nationwide",
    issuer: "Nationwide",
    product: "IUL Protector II",
    nullReason: "not_stated"
  });

  const percentMentioned = /percent of premium expense charge|percent of premium/i.test(text);
  const percentRate = text.match(
    /percent of premium(?: expense charge)?[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*%/i
  );
  const percentPage = pageForPattern(pages, /percent of premium/i);

  const coiMentioned = /cost of insurance/i.test(text);
  const optionalCoiMissing = /optional cost of insurance report was not generated/i.test(text) ||
    /cost of insurance report/i.test(text);
  const crcoi = /25%\s+coi rate reduction|continuation of coi/i.test(text);
  const inferredForbidden = !/av\s*[−\-]\s*csv/i.test(text);

  const expenseMentioned = /monthly expense charge/i.test(text);
  const policyFeeMentioned = /monthly policy fee|per policy charges/i.test(text);
  const avChargeMentioned = /percent of accumulated value|%\s+of accumulated value/i.test(text);

  const coiTable = parseExplicitCoiTable(pages);
  const surrenderSchedule = parseSurrenderChargeSchedule(pages);

  const percentOfPremiumExpenseCharge = percentRate
    ? {
        ...terms.percentOfPremiumExpenseCharge,
        existenceMentioned: true,
        rate: extractedExact(
          Number(percentRate[1]) / 100,
          createProvenance({
            sourcePage: percentPage,
            adapterKey: ADAPTER_KEY,
            section: "percent_of_premium_expense_charge",
            classification: VALUE_CLASSIFICATIONS.EXTRACTED_EXACT,
            sourceText: percentRate[0]
          })
        )
      }
    : {
        ...terms.percentOfPremiumExpenseCharge,
        existenceMentioned: percentMentioned,
        rate: unavailableValue(
          percentMentioned ? "mentioned_no_rate_printed" : "not_stated",
          createProvenance({
            sourcePage: percentPage,
            adapterKey: ADAPTER_KEY,
            section: "percent_of_premium_expense_charge",
            classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
            nullReason: percentMentioned ? "mentioned_no_rate_printed" : "not_stated"
          })
        ),
        notes: percentMentioned ? "existence_only" : null
      };

  const costOfInsurance = {
    ...terms.costOfInsurance,
    existenceMentioned: coiMentioned,
    annualByYear: Object.freeze(coiTable.annualByYear),
    annualDollars: coiTable.found
      ? (coiTable.annualByYear[1] || unavailableValue("coi_table_present_year_1_missing"))
      : unavailableValue(
        optionalCoiMissing ? "optional_coi_report_not_included" : "annual_coi_not_in_illustration",
        createProvenance({
          adapterKey: ADAPTER_KEY,
          section: "cost_of_insurance",
          classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
          nullReason: optionalCoiMissing
            ? "optional_coi_report_not_included"
            : "annual_coi_not_in_illustration"
        })
      ),
    continuationOfCoiEndorsement: crcoi
      ? {
          mentioned: true,
          storedAsAnnualCoi: false,
          note: "illustrated_values_already_reflect_endorsement_not_annual_coi_dollars"
        }
      : null,
    notes: inferredForbidden ? "coi_not_inferred_from_av_or_csv" : null
  };

  return Object.freeze({
    ...terms,
    percentOfPremiumExpenseCharge: Object.freeze(percentOfPremiumExpenseCharge),
    costOfInsurance: Object.freeze(costOfInsurance),
    monthlyExpenseCharge: Object.freeze({
      ...terms.monthlyExpenseCharge,
      existenceMentioned: expenseMentioned,
      notes: expenseMentioned ? "named_without_dollar_amount" : null
    }),
    monthlyPolicyFee: Object.freeze({
      ...terms.monthlyPolicyFee,
      existenceMentioned: policyFeeMentioned,
      notes: policyFeeMentioned ? "named_without_dollar_amount" : null
    }),
    monthlyPercentOfAccumulatedValue: Object.freeze({
      ...terms.monthlyPercentOfAccumulatedValue,
      existenceMentioned: avChargeMentioned
    }),
    riderCharges: Object.freeze({
      ...terms.riderCharges,
      existenceMentioned: /rider/i.test(text),
      notes: "annual_rider_charge_column_not_in_ledger"
    }),
    surrenderCharges: Object.freeze({
      ...terms.surrenderCharges,
      existenceMentioned: surrenderSchedule.length > 0,
      schedule: Object.freeze(surrenderSchedule),
      separateFromCsv: true,
      annualDollars: surrenderSchedule[0]
        ? extractedExact(
          surrenderSchedule[0].surrenderCharge,
          createProvenance({
            sourcePage: surrenderSchedule[0].sourcePage,
            adapterKey: ADAPTER_KEY,
            table: "surrender_charge_schedule",
            classification: VALUE_CLASSIFICATIONS.EXTRACTED_EXACT
          })
        )
        : terms.surrenderCharges.annualDollars
    })
  });
}

function applyExplicitAnnualCosts(engineRows = [], costTerms = null) {
  const byYear = costTerms?.costOfInsurance?.annualByYear || {};
  return (engineRows || []).map((row) => {
    const overlay = byYear[row.policyYear];
    if (
      overlay &&
      overlay.value != null &&
      (overlay.classification === VALUE_CLASSIFICATIONS.EXTRACTED_EXACT ||
        overlay.classification === VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS)
    ) {
      return {
        ...row,
        costOfInsurance: overlay.value,
        costOfInsuranceClassification: overlay.classification
      };
    }
    return row;
  });
}

module.exports = {
  parseNationwidePolicyCosts,
  applyExplicitAnnualCosts,
  ADAPTER_KEY
};
