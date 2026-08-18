/**
 * Nationwide IUL Protector II living-benefit / rider economics (BR-144).
 * Multi-page section assembly. Form numbers captured.
 * Does not invent a discount factor or cash payout.
 * Does not reuse National Life ABR assumptions.
 */

const {
  VALUE_CLASSIFICATIONS,
  CARRIER_CALCULATION_REQUIRED_TEXT,
  createRiderEconomics,
  RIDER_CATEGORIES,
  createProvenance
} = require("../policy-economics");

const ADAPTER_KEY = "nationwide-iul";

const RIDER_SPECS = Object.freeze([
  {
    type: "Terminal Illness",
    riderCategory: RIDER_CATEGORIES.LIVING_BENEFIT,
    start: /Living Benefit for Terminal Illness|Terminal Illness Rider/i,
    formNumber: "ICC13-NWLA-495",
    formPattern: /ICC13-NWLA-495/i
  },
  {
    type: "Chronic Illness",
    riderCategory: RIDER_CATEGORIES.LIVING_BENEFIT,
    start: /Chronic Illness Rider/i,
    formNumber: "ICC20-NWLA-567",
    formPattern: /ICC20-NWLA-567/i
  },
  {
    type: "Critical Illness",
    riderCategory: RIDER_CATEGORIES.LIVING_BENEFIT,
    start: /Critical Illness Rider/i,
    formNumber: "ICC20-NWLA-606",
    formPattern: /ICC20-NWLA-606/i
  },
  {
    type: "Critical Injury",
    riderCategory: RIDER_CATEGORIES.LIVING_BENEFIT,
    start: /Critical Injury Rider/i,
    formNumber: "ICC20-NWLA-607",
    formPattern: /ICC20-NWLA-607/i
  },
  {
    type: "Overloan Lapse Protection",
    riderCategory: RIDER_CATEGORIES.OTHER,
    start: /Overloan Lapse Protection/i,
    formNumber: "ICC20-NWLA-594",
    formPattern: /ICC20-NWLA-594/i
  }
]);

function firstNumber(text, pattern) {
  const match = String(text || "").match(pattern);
  if (!match) {
    return null;
  }
  const raw = String(match[1]).replace(/,/g, "");
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function markPages(pages = []) {
  return (pages || [])
    .map((page) => `<<<PAGE ${page.page}>>>\n${String(page.text || "")}`)
    .join("\n");
}

function pageAt(marked, index) {
  const before = marked.slice(0, index);
  const matches = [...before.matchAll(/<<<PAGE (\d+)>>>/g)];
  if (!matches.length) {
    return null;
  }
  return Number(matches[matches.length - 1][1]);
}

function findFormNumber(windowText, spec) {
  if (spec.formPattern.test(windowText)) {
    return spec.formNumber;
  }
  const generic = windowText.match(/ICC\d{2}-NWLA-\d{3}/i);
  return generic ? generic[0].toUpperCase() : spec.formNumber;
}

function taxCaveat(text) {
  if (/medicaid|taxable|tax consequences/i.test(text)) {
    return "benefits_may_have_tax_or_medicaid_consequences_as_described_in_rider";
  }
  return null;
}

function extractTerminal(text) {
  const maxPercent = firstNumber(
    text,
    /cannot exceed\s+(\d+(?:\.\d+)?)%\s+of the base policy/i
  );
  const minDollars = firstNumber(
    text,
    /(?:accelerated death benefit payment|payment) must be at least\s+\$([0-9,]+)/i
  );
  const maxDollars = firstNumber(
    text,
    /(?:shall not exceed|not exceed)\s+\$([0-9,]+)/i
  );
  const remaining = /remaining death benefit[\s\S]{0,80}policy minimum/i.test(text)
    ? "policy_minimum_remaining_required"
    : null;

  return {
    qualifyingTrigger: "terminal_illness_life_expectancy_as_described_in_rider",
    eligibilityDefinition: /12-month|12 month/i.test(text)
      ? "terminal_illness_life_expectancy_12_months_or_as_described"
      : "terminal_illness_as_described_in_rider",
    maximumAccelerationPercent: maxPercent,
    minimumDollarAmount: minDollars,
    maximumDollarAmount: maxDollars,
    remainingDeathBenefit: remaining,
    riderCharges: /no upfront charge/i.test(text)
      ? { upfrontCharge: 0, chargedAtClaim: true }
      : null,
    taxMedicaidCaveats: taxCaveat(text)
  };
}

function extractChronic(text) {
  const adminCap = firstNumber(text, /administrative charge of up to\s+\$([0-9,]+)/i);
  const adl = /activit(?:y|ies) of daily living|2 of 6|cognitive/i.test(text);
  return {
    qualifyingTrigger: adl
      ? "chronic_illness_adls_or_cognitive_impairment_as_described_in_rider"
      : "chronic_illness_as_described_in_rider",
    eligibilityDefinition: adl
      ? "unable_to_perform_adls_or_severe_cognitive_impairment_as_described"
      : null,
    administrativeFees: adminCap != null ? { cap: adminCap, deductedFromBenefit: true } : null,
    riderCharges: adminCap != null
      ? { administrativeChargeCap: adminCap, chargedOnlyIfBenefitPaid: true }
      : null,
    discountMethodology: /more than one dollar for each dollar/i.test(text)
      ? "more_than_dollar_for_dollar_at_claim"
      : null,
    discountFactor: null,
    discountVariables: /interest rates and age/i.test(text)
      ? { claimInterestRates: true, attainedAgeAtClaim: true }
      : null,
    loanDebtEffect: /loan|unpaid charges deducted/i.test(text)
      ? "loans_and_unpaid_charges_deducted_from_benefit"
      : null,
    effectOnCashValue: /specified amount and other policy values are reduced/i.test(text)
      ? "specified_amount_and_policy_values_reduced_at_claim"
      : null,
    taxMedicaidCaveats: taxCaveat(text)
  };
}

function extractCritical(text) {
  const annualPercent = firstNumber(
    text,
    /lesser of\s+(\d+(?:\.\d+)?)%\s+of the specified amount/i
  );
  const perEvent = firstNumber(
    text,
    /specified amount or\s+\$([0-9,]+)\s+per event/i
  ) ?? firstNumber(text, /\$([0-9,]+)\s+per event/i);
  const maxClaims = firstNumber(
    text,
    /maximum of\s+(\d+)\s+(?:times|claims)/i
  ) ?? firstNumber(text, /up to\s+(\d+)\s+claims/i) ??
    firstNumber(text, /max(?:imum)?\s+(\d+)\s+claims/i);
  const adminCap = firstNumber(text, /administrative charge of up to\s+\$([0-9,]+)/i);

  return {
    qualifyingTrigger: "diagnosed_conditions_as_described_in_rider",
    eligibilityDefinition: "listed_critical_illness_diagnoses_as_described_in_rider",
    maximumAccelerationPercent: null,
    annualLimitPercent: annualPercent,
    annualLimitDollars: perEvent,
    maxClaims,
    eventLimits: perEvent != null ? { perEventDollars: perEvent } : null,
    administrativeFees: adminCap != null ? { cap: adminCap, deductedFromBenefit: true } : null,
    riderCharges: adminCap != null
      ? { administrativeChargeCap: adminCap, chargedOnlyIfBenefitPaid: true }
      : /no upfront charge/i.test(text)
        ? { upfrontCharge: 0, chargedAtClaim: true }
        : null,
    discountMethodology: /more than one dollar for each dollar/i.test(text)
      ? "more_than_dollar_for_dollar_at_claim"
      : null,
    discountFactor: null,
    taxMedicaidCaveats: taxCaveat(text)
  };
}

function extractOverloan(text) {
  return {
    qualifyingTrigger: null,
    eligibilityDefinition: /after (?:policy )?year 15/i.test(text)
      ? "may_be_invoked_after_year_15_and_age_65_as_described"
      : "overloan_lapse_protection_as_described",
    riderCharges: /no charge until/i.test(text)
      ? { extraPremium: 0, feeWhenExercised: true, amount: null }
      : null,
    payoutClassification: null,
    notes: "not_a_living_benefit_acceleration_rider"
  };
}

function extractByType(type, text) {
  if (type === "Terminal Illness") {
    return extractTerminal(text);
  }
  if (type === "Chronic Illness") {
    return extractChronic(text);
  }
  if (type === "Critical Illness" || type === "Critical Injury") {
    return extractCritical(text);
  }
  if (type === "Overloan Lapse Protection") {
    return extractOverloan(text);
  }
  return {};
}

function parseNationwideLivingBenefitRiders(pages = []) {
  const marked = markPages(pages);
  const starts = RIDER_SPECS.map((spec) => {
    const match = spec.start.exec(marked);
    if (!match && !spec.formPattern.test(marked)) {
      return null;
    }
    const index = match ? match.index : marked.search(spec.formPattern);
    if (index < 0) {
      return null;
    }
    return { spec, index };
  }).filter(Boolean);

  starts.sort((a, b) => a.index - b.index);

  return starts.map((entry, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : marked.length;
    const windowText = marked.slice(entry.index, end).replace(/<<<PAGE \d+>>>/g, "\n");
    const spec = entry.spec;
    const formNumber = findFormNumber(windowText, spec);
    const fields = extractByType(spec.type, windowText);
    const sourcePage = pageAt(marked, entry.index);

    return createRiderEconomics({
      carrier: "Nationwide",
      issuer: "Nationwide",
      product: "IUL Protector II",
      adapterKey: ADAPTER_KEY,
      type: spec.type,
      name: spec.type,
      riderCategory: spec.riderCategory,
      formNumber,
      formNumbers: [formNumber],
      sourcePage,
      sourceSnippet: "explicit_rider_narrative",
      sourceText: windowText,
      calculated: false,
      completeCalculationChain: false,
      payoutClassification: spec.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT
        ? VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
        : fields.payoutClassification,
      payoutReportText: spec.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT
        ? CARRIER_CALCULATION_REQUIRED_TEXT
        : null,
      cashReceivedNotEqualToAmountAccelerated:
        spec.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT,
      ...fields
    });
  });
}

module.exports = {
  parseNationwideLivingBenefitRiders,
  ADAPTER_KEY
};
