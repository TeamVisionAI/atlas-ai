/**
 * Report-ready DTOs for policy-cost checkpoints and living-benefit cards (BR-144).
 * No UI. Null costs stay null.
 */

const {
  buildReportCheckpoints,
  DEFAULT_CHECKPOINT_YEARS
} = require("../illustration-extract/reportCheckpoints");
const { VALUE_CLASSIFICATIONS, CARRIER_CALCULATION_REQUIRED_TEXT } = require("./classifications");
const { overlayAnnualByYear } = require("./policyCostTerms");
const { POLICY_COST_CATEGORY_ORDER } = require("./policyCostCategories");
const {
  fromRawNumber,
  unavailableValue,
  sumKnownDollarValues,
  createClassifiedValue
} = require("./classifiedValue");
const { createProvenance } = require("./provenance");

function classifiedFromRow(value, { nullReason, provenance, explicitZero = true } = {}) {
  return fromRawNumber(value, { nullReason, provenance, explicitZero });
}

const COST_TERM_FIELDS = Object.freeze({
  percent_of_premium_expense_charge: "percentOfPremiumExpenseCharge",
  cost_of_insurance: "costOfInsurance",
  monthly_expense_charge: "monthlyExpenseCharge",
  monthly_policy_fee: "monthlyPolicyFee",
  monthly_percent_of_accumulated_value: "monthlyPercentOfAccumulatedValue",
  rider_charges: "riderCharges",
  surrender_charges: "surrenderCharges"
});

function extraCheckpointYears(timeline = []) {
  const years = (Array.isArray(timeline) ? timeline : [])
    .map((row) => Number(row?.policyYear))
    .filter((year) => Number.isInteger(year) && year > 0);
  if (!years.length) {
    return [];
  }
  const lastYear = Math.max(...years);
  return DEFAULT_CHECKPOINT_YEARS.includes(lastYear) ? [] : [lastYear];
}

function preferredClassifiedFromCategory(terms) {
  if (!terms || typeof terms !== "object") {
    return unavailableValue("not_stated");
  }
  const candidates = [terms.annualDollars, terms.monthlyDollars, terms.rate];
  for (const candidate of candidates) {
    if (
      candidate &&
      candidate.classification !== VALUE_CLASSIFICATIONS.NOT_AVAILABLE &&
      (candidate.value != null ||
        candidate.classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED)
    ) {
      return candidate;
    }
  }
  return terms.annualDollars || unavailableValue("not_stated");
}

function buildPolicyCostCategoryCards(costTerms = null) {
  return POLICY_COST_CATEGORY_ORDER.map((category) => {
    const terms = costTerms ? costTerms[COST_TERM_FIELDS[category.id]] : null;
    const display = preferredClassifiedFromCategory(terms);
    return Object.freeze({
      id: category.id,
      number: category.number,
      label: category.label,
      display,
      rate: terms?.rate || unavailableValue("not_stated"),
      monthlyDollars: terms?.monthlyDollars || unavailableValue("not_stated"),
      annualDollars: terms?.annualDollars || unavailableValue("not_stated"),
      existenceMentioned: terms?.existenceMentioned === true,
      notes: terms?.notes || null,
      scheduleLength: Array.isArray(terms?.schedule) ? terms.schedule.length : 0,
      sourcePages: Object.freeze(
        [...new Set(
          [
            display?.provenance?.sourcePage,
            terms?.annualDollars?.provenance?.sourcePage,
            terms?.rate?.provenance?.sourcePage,
            ...(Array.isArray(terms?.schedule)
              ? terms.schedule.flatMap((item) => [item?.sourcePage, item?.provenance?.sourcePage])
              : [])
          ].filter((page) => Number.isInteger(Number(page)) && Number(page) > 0).map(Number)
        )].sort((a, b) => a - b)
      ),
      separateFromCsv: terms?.separateFromCsv === true,
      provenance: display?.provenance || terms?.annualDollars?.provenance || null
    });
  });
}

function buildPolicyCostCheckpoints({
  timeline = [],
  costTerms = null,
  adapterKey = null,
  requestedYears = null
} = {}) {
  const years = Array.isArray(requestedYears) && requestedYears.length
    ? requestedYears
    : [...DEFAULT_CHECKPOINT_YEARS, ...extraCheckpointYears(timeline)];
  const points = buildReportCheckpoints(timeline, years);

  return points.map((point) => {
    const row = point.row || {};
    const year = point.usedYear;
    const provenance = createProvenance({
      sourcePage: row.sourcePage ?? row.metadata?.sourcePage ?? null,
      adapterKey,
      table: "annual_values_checkpoint",
      section: `year_${point.requestedYear}`
    });

    const premium = classifiedFromRow(row.annualPremium, {
      nullReason: "premium_not_on_checkpoint_year",
      provenance
    });
    const coiOverlay = year != null && costTerms
      ? overlayAnnualByYear(costTerms.costOfInsurance, year)
      : null;
    const coi = coiOverlay && coiOverlay.classification !== VALUE_CLASSIFICATIONS.NOT_AVAILABLE
      ? coiOverlay
      : classifiedFromRow(row.costOfInsurance, {
        nullReason: "annual_coi_not_in_illustration",
        provenance
      });

    const premiumLoad = classifiedFromRow(row.premiumLoad, {
      nullReason: "premium_load_not_in_illustration",
      provenance
    });
    const monthlyExpense = year != null && costTerms
      ? overlayAnnualByYear(costTerms.monthlyExpenseCharge, year)
      : unavailableValue("monthly_expense_not_in_illustration", provenance);
    const policyFee = year != null && costTerms
      ? overlayAnnualByYear(costTerms.monthlyPolicyFee, year)
      : unavailableValue("policy_fee_not_in_illustration", provenance);
    const percentAvCharge = year != null && costTerms
      ? overlayAnnualByYear(costTerms.monthlyPercentOfAccumulatedValue, year)
      : unavailableValue("percent_av_charge_not_in_illustration", provenance);
    const riderCharges = classifiedFromRow(row.riderCharges, {
      nullReason: "annual_rider_charges_not_in_illustration",
      provenance
    });
    const surrenderCharge = classifiedFromRow(
      row.surrenderCharge ?? row.metadata?.surrenderCharge,
      {
        nullReason: "surrender_charge_not_on_this_year",
        provenance: createProvenance({
          ...provenance,
          table: "surrender_charge_schedule"
        })
      }
    );

    const otherKnownCharges = sumKnownDollarValues(
      [premiumLoad, monthlyExpense, policyFee, percentAvCharge, riderCharges],
      createProvenance({
        adapterKey,
        section: "other_known_charges",
        classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS
      })
    );
    const totalKnownPolicyCosts = sumKnownDollarValues(
      [coi, premiumLoad, monthlyExpense, policyFee, percentAvCharge, riderCharges],
      createProvenance({
        adapterKey,
        section: "total_known_policy_costs",
        classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS
      })
    );

    return Object.freeze({
      requestedYear: point.requestedYear,
      year: point.usedYear,
      usedYear: point.usedYear,
      fallback: point.fallback === true,
      fallbackStep: point.fallbackStep,
      attainedAge: row.insuredAge ?? null,
      premium,
      costOfInsurance: coi,
      premiumLoad,
      monthlyExpense,
      policyFee,
      percentOfAccumulatedValueCharge: percentAvCharge,
      riderCharges,
      otherKnownCharges,
      surrenderCharge,
      totalKnownPolicyCosts,
      accountValue: classifiedFromRow(row.accountValue, {
        nullReason: "account_value_not_on_checkpoint_year",
        provenance
      }),
      cashSurrenderValue: classifiedFromRow(row.cashSurrenderValue, {
        nullReason: "csv_not_on_checkpoint_year",
        provenance
      }),
      deathBenefit: classifiedFromRow(row.deathBenefit, {
        nullReason: "death_benefit_not_on_checkpoint_year",
        provenance
      }),
      surrenderChargeSeparateFromCsv: true,
      invented: false,
      interpolated: false,
      provenance
    });
  });
}

function buildLivingBenefitCard(rider = {}) {
  const payoutClassification =
    rider.payoutClassification || VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED;
  const exactPayoutCalculable =
    payoutClassification === VALUE_CLASSIFICATIONS.EXTRACTED_EXACT ||
    payoutClassification === VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS;

  return Object.freeze({
    rider: rider.name || rider.type || null,
    type: rider.type || null,
    form: rider.formNumber || null,
    formNumbers: rider.formNumbers || (rider.formNumber ? [rider.formNumber] : []),
    carrier: rider.carrier || null,
    issuer: rider.issuer || null,
    product: rider.product || null,
    whatQualifies: rider.eligibilityDefinition || rider.qualifyingTrigger || null,
    limits: Object.freeze({
      minAccelerationPercent: rider.minAccelerationPercent ?? null,
      minAccelerationDollars: rider.minAccelerationDollars ?? rider.minimumDollarAmount ?? null,
      maxAccelerationPercent: rider.maxAccelerationPercent ?? rider.maximumAccelerationPercent ?? null,
      maxAccelerationDollars: rider.maxAccelerationDollars ?? rider.maximumDollarAmount ?? null,
      monthlyLimit: rider.monthlyLimit ?? null,
      monthlyLimitPercent: rider.monthlyLimitPercent ?? null,
      annualLimitPercent: rider.annualLimitPercent ?? null,
      annualLimitDollars: rider.annualLimitDollars ?? null,
      maxClaims: rider.maxClaims ?? null,
      eventLimits: rider.eventLimits || null
    }),
    discountMethodology: rider.discountMethodology || null,
    discountFactor: rider.discountFactor ?? null,
    discountVariables: rider.discountVariables || null,
    exactPayout: exactPayoutCalculable
      ? createClassifiedValue({
        value: rider.actualCashBenefit,
        classification: payoutClassification
      })
      : createClassifiedValue({
        value: null,
        classification: VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED,
        nullReason: "incomplete_acceleration_calculation_chain"
      }),
    exactPayoutCalculable,
    carrierCalculationRequired: !exactPayoutCalculable,
    carrierCalculationRequiredText: !exactPayoutCalculable
      ? (rider.payoutReportText || CARRIER_CALCULATION_REQUIRED_TEXT)
      : null,
    remainingDeathBenefitEffect: rider.remainingDeathBenefit || null,
    accountValueEffect: rider.impactOnAccountValue || rider.effectOnCashValue || null,
    cashSurrenderValueEffect: rider.impactOnCashSurrenderValue || rider.effectOnCashValue || null,
    loanDebtEffect: rider.loanDebtEffect || null,
    taxMedicaidCaveats: rider.taxMedicaidCaveats || null,
    administrativeFees: rider.administrativeFees || null,
    riderCharges: rider.riderCharges || null,
    cashReceivedNotEqualToAmountAccelerated:
      rider.cashReceivedNotEqualToAmountAccelerated !== false,
    sourcePage: rider.sourcePage ?? rider.provenance?.sourcePage ?? null,
    sourcePages: Object.freeze(
      [...new Set(
        [
          ...(Array.isArray(rider.sourcePages) ? rider.sourcePages : []),
          rider.sourcePage,
          rider.provenance?.sourcePage
        ].filter((page) => Number.isInteger(Number(page)) && Number(page) > 0).map(Number)
      )].sort((a, b) => a - b)
    ),
    provenance: rider.provenance || createProvenance({
      sourcePage: rider.sourcePage,
      formNumber: rider.formNumber,
      adapterKey: rider.adapterKey,
      section: rider.type
    }),
    invented: false,
    interpolated: false
  });
}

function buildLivingBenefitCards(riders = []) {
  return (Array.isArray(riders) ? riders : []).map((rider) => buildLivingBenefitCard(rider));
}

function buildPolicyEconomicsReportDto({
  timeline = [],
  costTerms = null,
  riders = [],
  adapterKey = null,
  carrier = null,
  issuer = null,
  product = null
} = {}) {
  return Object.freeze({
    layer: "policy_economics_report",
    adapterKey,
    carrier,
    issuer,
    product,
    policyCostCheckpoints: buildPolicyCostCheckpoints({ timeline, costTerms, adapterKey }),
    policyCostCategories: buildPolicyCostCategoryCards(costTerms),
    livingBenefitCards: buildLivingBenefitCards(riders),
    invented: false,
    interpolated: false
  });
}

module.exports = {
  buildPolicyCostCheckpoints,
  buildPolicyCostCategoryCards,
  buildLivingBenefitCard,
  buildLivingBenefitCards,
  buildPolicyEconomicsReportDto
};
