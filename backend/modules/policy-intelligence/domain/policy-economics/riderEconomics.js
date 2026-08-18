/**
 * Canonical living-benefit / rider economics (BR-144).
 * Never assume cash benefit = death benefit accelerated.
 */

const {
  VALUE_CLASSIFICATIONS,
  CARRIER_CALCULATION_REQUIRED_TEXT
} = require("./classifications");
const { createProvenance } = require("./provenance");
const { carrierCalculationRequired, unavailableValue } = require("./classifiedValue");

const RIDER_CATEGORIES = Object.freeze({
  LIVING_BENEFIT: "living_benefit",
  OTHER: "other"
});

function freezeIfObject(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.freeze(value);
}

function resolveAcceleratedBenefitPayout({
  discountFactor = null,
  deathBenefitElectedForAcceleration = null,
  actualCashBenefit = null,
  completeCalculationChain = false
} = {}) {
  if (
    completeCalculationChain === true &&
    typeof discountFactor === "number" &&
    typeof deathBenefitElectedForAcceleration === "number" &&
    typeof actualCashBenefit === "number"
  ) {
    return Object.freeze({
      classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
      actualCashBenefit,
      deathBenefitElectedForAcceleration,
      reportText: null
    });
  }

  return Object.freeze({
    classification: VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED,
    actualCashBenefit: null,
    deathBenefitElectedForAcceleration: deathBenefitElectedForAcceleration ?? null,
    reportText: CARRIER_CALCULATION_REQUIRED_TEXT
  });
}

function createRiderEconomics(input = {}) {
  const payout = resolveAcceleratedBenefitPayout({
    discountFactor: input.discountFactor,
    deathBenefitElectedForAcceleration: input.deathBenefitElectedForAcceleration ??
      input.amountOfDeathBenefitAccelerated,
    actualCashBenefit: input.actualCashBenefit ?? input.estimatedActualCashBenefit,
    completeCalculationChain: input.completeCalculationChain === true
  });

  const isLivingBenefit =
    input.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT ||
    /illness|injury|living benefit|accelerated|abr/i.test(
      `${input.type || ""} ${input.name || ""}`
    );

  const payoutClassification = isLivingBenefit
    ? (input.payoutClassification || payout.classification)
    : input.payoutClassification || null;

  return Object.freeze({
    carrier: input.carrier || null,
    issuer: input.issuer || null,
    product: input.product || null,
    formNumber: input.formNumber || null,
    formVersion: input.formVersion || null,
    formNumbers: Object.freeze(
      Array.isArray(input.formNumbers)
        ? input.formNumbers.filter(Boolean)
        : input.formNumber
          ? [input.formNumber]
          : []
    ),
    name: input.name || input.type || null,
    type: input.type || input.name || null,
    riderCategory: input.riderCategory ||
      (isLivingBenefit ? RIDER_CATEGORIES.LIVING_BENEFIT : RIDER_CATEGORIES.OTHER),
    qualifyingTrigger: input.qualifyingTrigger || null,
    eligibilityDefinition: input.eligibilityDefinition || null,
    minAccelerationPercent: input.minAccelerationPercent ?? input.minimumAccelerationPercent ?? null,
    minAccelerationDollars: input.minAccelerationDollars ?? input.minimumDollarAmount ?? null,
    maxAccelerationPercent: input.maxAccelerationPercent ?? input.maximumAccelerationPercent ?? null,
    maxAccelerationDollars: input.maxAccelerationDollars ?? input.maximumDollarAmount ?? null,
    eventLimits: freezeIfObject(input.eventLimits) || null,
    claimFrequency: input.claimFrequency || null,
    maxClaims: input.maxClaims ?? null,
    administrativeFees: freezeIfObject(input.administrativeFees) || null,
    riderCharges: freezeIfObject(input.riderCharges) || null,
    discountMethodology: input.discountMethodology || null,
    discountFactor: input.discountFactor ?? null,
    discountVariables: freezeIfObject(input.discountVariables) || null,
    discountSampleInterestRate: input.discountSampleInterestRate ?? null,
    discountSampleNote: input.discountSampleNote || null,
    deathBenefitElectedForAcceleration:
      input.deathBenefitElectedForAcceleration ?? input.amountOfDeathBenefitAccelerated ?? null,
    actualCashBenefit: payout.actualCashBenefit,
    estimatedActualCashBenefit: payout.actualCashBenefit,
    amountOfDeathBenefitAccelerated:
      input.amountOfDeathBenefitAccelerated ?? input.deathBenefitElectedForAcceleration ?? null,
    remainingDeathBenefit: input.remainingDeathBenefit || null,
    impactOnAccountValue: input.impactOnAccountValue || input.effectOnCashValue || null,
    impactOnCashSurrenderValue: input.impactOnCashSurrenderValue || null,
    effectOnCashValue: input.effectOnCashValue || input.impactOnAccountValue || null,
    loanDebtEffect: input.loanDebtEffect || null,
    taxMedicaidCaveats: input.taxMedicaidCaveats || null,
    cashReceivedNotEqualToAmountAccelerated:
      input.cashReceivedNotEqualToAmountAccelerated !== false && isLivingBenefit,
    payoutClassification,
    payoutReportText: isLivingBenefit
      ? (input.payoutReportText ||
        (payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
          ? CARRIER_CALCULATION_REQUIRED_TEXT
          : null))
      : input.payoutReportText || null,
    monthlyLimit: input.monthlyLimit ?? null,
    monthlyLimitPercent: input.monthlyLimitPercent ?? null,
    annualLimitPercent: input.annualLimitPercent ?? null,
    annualLimitDollars: input.annualLimitDollars ?? null,
    maximumAccelerationPercent: input.maxAccelerationPercent ?? input.maximumAccelerationPercent ?? null,
    maximumDollarAmount: input.maxAccelerationDollars ?? input.maximumDollarAmount ?? null,
    minimumDollarAmount: input.minAccelerationDollars ?? input.minimumDollarAmount ?? null,
    adapterKey: input.adapterKey || null,
    sourcePage: input.sourcePage ?? null,
    sourcePages: Object.freeze(
      [...new Set(
        [
          ...(Array.isArray(input.sourcePages) ? input.sourcePages : []),
          input.sourcePage
        ].filter((page) => Number.isInteger(Number(page)) && Number(page) > 0).map(Number)
      )].sort((a, b) => a - b)
    ),
    sourceSnippet: input.sourceSnippet || null,
    calculated: input.calculated === true,
    notes: input.notes || null,
    amount: input.amount ?? null,
    provenance: input.provenance || createProvenance({
      sourcePage: input.sourcePage,
      formNumber: input.formNumber,
      formVersion: input.formVersion,
      adapterKey: input.adapterKey,
      section: input.type || input.name,
      sourceSnippet: input.sourceSnippet,
      sourceText: input.sourceText,
      classification: payoutClassification,
      nullReason: isLivingBenefit && payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
        ? "incomplete_acceleration_calculation_chain"
        : null
    }),
    invented: false,
    interpolated: false,
    actualCashBenefitClassified: isLivingBenefit
      ? carrierCalculationRequired(
        "incomplete_acceleration_calculation_chain",
        input.provenance || null
      )
      : unavailableValue("not_a_living_benefit")
  });
}

module.exports = {
  RIDER_CATEGORIES,
  createRiderEconomics,
  resolveAcceleratedBenefitPayout,
  CARRIER_CALCULATION_REQUIRED_TEXT
};
