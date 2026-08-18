/**
 * National Life / LSW FlexLife II rider capture (form series 20417FL).
 * Stores only values stated in the illustration. Does not calculate ABR cash.
 * Does not reuse Nationwide rider column or discount assumptions.
 */

const {
  VALUE_CLASSIFICATIONS,
  CARRIER_CALCULATION_REQUIRED_TEXT,
  createRiderEconomics
} = require("../policy-economics");

const CARRIER_CALCULATION_REQUIRED = VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED;

const RIDER_SPECS = Object.freeze([
  {
    type: "Terminal Illness ABR",
    formNumber: "8052FL",
    formPattern: /8052FL/i,
    qualifyingTrigger: "terminal_illness_physician_death_within_24_months"
  },
  {
    type: "Chronic Illness ABR",
    formNumber: "8095FL",
    formPattern: /8095FL/i,
    qualifyingTrigger: "chronic_illness_2_of_6_adls_or_cognitive_impairment"
  },
  {
    type: "Critical Illness ABR",
    formNumber: "20287FL",
    formPattern: /20287FL/i,
    qualifyingTrigger: "critical_illness_listed_diagnoses_as_described_in_rider"
  },
  {
    type: "Critical Injury ABR",
    formNumber: "20288FL",
    formPattern: /20288FL/i,
    qualifyingTrigger: "critical_injury_listed_events_as_described_in_rider"
  },
  {
    type: "Charitable Matching Gift",
    formNumber: "20186FL",
    formPattern: /20186FL/i,
    qualifyingTrigger: null
  },
  {
    type: "Death Benefit Protection Rider",
    formNumber: "20223FL",
    formPattern: /20223FL/i,
    qualifyingTrigger: null
  },
  {
    type: "Interest Crediting Strategies Rider",
    formNumber: "20256FL",
    formNumbers: ["20256FL", "20257FL", "20258FL", "20259FL", "20260FL", "20432FL"],
    formPattern: /20256FL/i,
    qualifyingTrigger: null
  },
  {
    type: "Lifetime Income Benefit Rider",
    formNumber: "20266FL",
    formPattern: /20266FL/i,
    qualifyingTrigger: null
  },
  {
    type: "Overloan Protection Rider",
    formNumber: "8315",
    formPattern: /\[Form Series 8315\]|Overloan Protection Rider \(OPR\) \[Form Series 8315\]/i,
    qualifyingTrigger: null
  },
  {
    type: "Systematic Allocation Rider",
    formNumber: "20431",
    formPattern: /\[Form Series 20431\]/i,
    qualifyingTrigger: null
  },
  {
    type: "Accumulated Value Enhancement",
    formNumber: "20430FL",
    formPattern: /20430FL/i,
    qualifyingTrigger: null
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

function isAbr(type) {
  return /ABR/i.test(type);
}

function extractAbrEconomics(joinedText, spec) {
  const terminalChronicCap = firstNumber(
    joinedText,
    /ABR Benefit limit of \$([0-9,]+)\s+for terminal and chronic/i
  );
  const criticalCap = firstNumber(
    joinedText,
    /ABR Benefit limit of \$([0-9,]+)\s+for critical illness and critical injury/i
  );
  const floorCap = firstNumber(joinedText, /never be less than \$([0-9,]+)/i);
  const monthlyPercent = firstNumber(
    joinedText,
    /monthly limit to the\s+lesser of\s+(\d+(?:\.\d+)?)%\s+of the discounted death benefit/i
  );
  const monthlyDollars = firstNumber(
    joinedText,
    /discounted death benefit or \$([0-9,]+)/i
  );
  const annualPercent = firstNumber(
    joinedText,
    /any year is the lesser of\s+(\d+(?:\.\d+)?)%\s+of the death benefit/i
  );
  const annualDollars = firstNumber(
    joinedText,
    /election date or \$([0-9,]+)/i
  );

  const sampleInterest = /interest at 6\.5%/i.test(joinedText) ? 0.065 : null;
  const hasDiscountLanguage = /discount factor will be applied to the death benefit accelerated/i.test(
    joinedText
  );
  const cashLessThanAccelerated = /actual benefit paid will be less than the amount of death benefit accelerated/i.test(
    joinedText
  );
  const remainingReducedByAmountAccelerated = /death benefit will be reduced by the amount of the death benefit\s+you decide to accelerate/i.test(
    joinedText
  );

  let maximumDollarAmount = null;
  if (spec.formNumber === "8052FL" || spec.formNumber === "8095FL") {
    maximumDollarAmount = terminalChronicCap;
  } else if (spec.formNumber === "20287FL" || spec.formNumber === "20288FL") {
    maximumDollarAmount = criticalCap;
  }

  return {
    maximumAccelerationPercent: /accelerate up to 100%/i.test(joinedText) ? 100 : null,
    maximumDollarAmount,
    minimumDollarAmount: spec.formNumber === "8052FL" || spec.formNumber === "8095FL" ? floorCap : null,
    monthlyLimit: spec.formNumber === "8095FL" ? monthlyDollars : null,
    annualLimitPercent: spec.formNumber === "8095FL" ? annualPercent : null,
    annualLimitDollars: spec.formNumber === "8095FL" ? annualDollars : null,
    monthlyLimitPercent: spec.formNumber === "8095FL" ? monthlyPercent : null,
    riderCharges: /no additional premium/i.test(joinedText)
      ? { upfrontCharge: 0, extraPremium: 0 }
      : null,
    discountFactor: null,
    discountMethodology: hasDiscountLanguage
      ? "national_life_abr_mortality_table_and_interest_discount"
      : null,
    discountSampleInterestRate: sampleInterest,
    discountSampleNote: sampleInterest
      ? "illustrative_only_assumes_current_abr_mortality_tables_and_6_5_percent_interest"
      : null,
    amountOfDeathBenefitAccelerated: null,
    estimatedActualCashBenefit: null,
    payoutClassification: CARRIER_CALCULATION_REQUIRED,
    cashReceivedNotEqualToAmountAccelerated: cashLessThanAccelerated || hasDiscountLanguage,
    remainingDeathBenefit: remainingReducedByAmountAccelerated
      ? "reduced_by_amount_accelerated_not_by_cash_paid"
      : null,
    effectOnCashValue: /cash value and loan value also reduced/i.test(joinedText)
      ? "policy_values_reduced_at_claim_formula_not_stated"
      : null
  };
}

function extractNonAbrFields(joinedText, spec) {
  if (spec.formNumber === "20186FL") {
    return {
      maximumDollarAmount: firstNumber(joinedText, /provides up to \$([0-9,]+) of the base face/i),
      riderCharges: { extraPremium: 0 },
      payoutClassification: null,
      estimatedActualCashBenefit: null
    };
  }
  if (spec.formNumber === "20223FL") {
    return {
      notes: "no_lapse_first_25_years_if_monthly_guarantee_premium_met",
      riderCharges: null,
      payoutClassification: null
    };
  }
  if (spec.formNumber === "20266FL") {
    return {
      riderCharges: {
        chargedFromAccumulatedValueWhenExercised: true,
        amount: null,
        classification: CARRIER_CALCULATION_REQUIRED
      },
      payoutClassification: CARRIER_CALCULATION_REQUIRED,
      estimatedActualCashBenefit: null
    };
  }
  if (spec.formNumber === "8315") {
    return {
      riderCharges: {
        extraPremium: 0,
        feeWhenExercised: true,
        amount: null,
        classification: CARRIER_CALCULATION_REQUIRED
      },
      payoutClassification: CARRIER_CALCULATION_REQUIRED
    };
  }
  return {
    riderCharges: null,
    payoutClassification: null,
    estimatedActualCashBenefit: null
  };
}

function parseLswFlexLifeRiders(pages = []) {
  const joinedText = (pages || []).map((page) => String(page?.text || "")).join("\n");
  const riders = [];

  for (const spec of RIDER_SPECS) {
    let sourcePage = null;
    for (const page of pages || []) {
      if (spec.formPattern.test(String(page?.text || ""))) {
        sourcePage = page.page;
        break;
      }
    }
    if (sourcePage == null) {
      continue;
    }

    const economics = isAbr(spec.type)
      ? extractAbrEconomics(joinedText, spec)
      : extractNonAbrFields(joinedText, spec);

    riders.push(
      createRiderEconomics({
        carrier: "National Life Group",
        issuer: "Life Insurance Company of the Southwest",
        product: "FlexLife II",
        type: spec.type,
        name: spec.type,
        formNumber: spec.formNumber,
        formNumbers: spec.formNumbers || [spec.formNumber],
        adapterKey: "lsw-flexlife-ii-20417FL",
        sourcePage,
        sourceSnippet: "explicit_form_series_narrative",
        sourceText: joinedText,
        calculated: false,
        qualifyingTrigger: spec.qualifyingTrigger,
        completeCalculationChain: false,
        payoutReportText: isAbr(spec.type) ? CARRIER_CALCULATION_REQUIRED_TEXT : null,
        ...economics
      })
    );
  }

  return riders;
}

module.exports = {
  parseLswFlexLifeRiders,
  CARRIER_CALCULATION_REQUIRED
};
