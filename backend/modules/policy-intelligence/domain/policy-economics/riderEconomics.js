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

const ADJUSTMENT_TYPES = Object.freeze({
  ACTUARIAL_ADJUSTMENT_FACTOR: "ACTUARIAL_ADJUSTMENT_FACTOR"
});

const ACTUARIAL_ADJUSTMENT_FACTOR_DISPLAY = "Actuarial Adjustment Factor";
const ACTUARIAL_FACTOR_UNDISCLOSED_NOTE = "Factor/formula not disclosed in policy.";

function freezeIfObject(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.freeze(value);
}

/**
 * Structured actuarial adjustment metadata for accelerated benefits.
 * Never invents a factor, formula, or cash payout estimate.
 */
function createActuarialAdjustment(input = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const adjustmentType =
    input.adjustmentType ||
    (input.applies === true ? ADJUSTMENT_TYPES.ACTUARIAL_ADJUSTMENT_FACTOR : null);
  if (!adjustmentType) {
    return null;
  }

  const factorDisclosed = input.factorDisclosed === true;
  const formulaDisclosed = input.formulaDisclosed === true;
  const applies = input.applies !== false;
  const administrativeCharge =
    typeof input.administrativeCharge === "number"
      ? input.administrativeCharge
      : input.administrativeCharge == null
        ? null
        : Number(input.administrativeCharge);

  return Object.freeze({
    adjustmentType,
    displayLabel:
      input.displayLabel ||
      (adjustmentType === ADJUSTMENT_TYPES.ACTUARIAL_ADJUSTMENT_FACTOR
        ? ACTUARIAL_ADJUSTMENT_FACTOR_DISPLAY
        : String(adjustmentType).replace(/_/g, " ")),
    applies,
    factorDisclosed,
    formulaDisclosed,
    administrativeCharge:
      Number.isFinite(administrativeCharge) ? administrativeCharge : null,
    uiNote:
      input.uiNote ||
      (!factorDisclosed || !formulaDisclosed
        ? ACTUARIAL_FACTOR_UNDISCLOSED_NOTE
        : null)
  });
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

  const actuarialAdjustment = createActuarialAdjustment(
    input.actuarialAdjustment ||
      (input.adjustmentType
        ? {
            adjustmentType: input.adjustmentType,
            displayLabel: input.displayLabel,
            applies: input.applies,
            factorDisclosed: input.factorDisclosed,
            formulaDisclosed: input.formulaDisclosed,
            administrativeCharge:
              input.administrativeCharge ??
              input.administrativeFees?.amount ??
              input.administrativeFees?.administrativeCharge,
            uiNote: input.uiNote
          }
        : null)
  );

  let administrativeFees = freezeIfObject(input.administrativeFees) || null;
  if (
    !administrativeFees &&
    actuarialAdjustment?.administrativeCharge != null
  ) {
    administrativeFees = Object.freeze({
      amount: actuarialAdjustment.administrativeCharge
    });
  }

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
    administrativeFees,
    riderCharges: freezeIfObject(input.riderCharges) || null,
    discountMethodology:
      input.discountMethodology ||
      (actuarialAdjustment?.applies
        ? actuarialAdjustment.adjustmentType
        : null),
    discountFactor: input.discountFactor ?? null,
    actuarialAdjustment,
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
  ADJUSTMENT_TYPES,
  ACTUARIAL_ADJUSTMENT_FACTOR_DISPLAY,
  ACTUARIAL_FACTOR_UNDISCLOSED_NOTE,
  createActuarialAdjustment,
  createRiderEconomics,
  resolveAcceleratedBenefitPayout,
  CARRIER_CALCULATION_REQUIRED_TEXT
};
