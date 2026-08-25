/**
 * Decreasing Term Policy Intelligence — Occidental / Leidy fixture verification.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { ATLAS_TERMS, mapToAtlasTerm } = require("../modules/policy-intelligence/domain/insurance-language/insuranceVocabulary");
const { normalizePolicyExtractionData } = require("../modules/policy-intelligence/domain/PolicyExtractionModel");
const { buildInsuranceFactsFromExtract } = require("../modules/policy-intelligence/domain/insurance-language/InsuranceFacts");
const { executeInsuranceBusinessRules } = require("../modules/policy-intelligence/domain/insurance-language/insuranceBusinessRulesEngine");
const { assembleClientPolicyReport } = require("../modules/policy-intelligence/application/assembleClientPolicyReport");
const {
  OCCIDENTAL_DECREASING_TERM_LEIDY,
  BASE_DEATH_BENEFIT_BY_YEAR
} = require("../modules/policy-intelligence/domain/annual-values/fixtures/occidentalDecreasingTermLeidyFixture");

test("vocabulary maps DECREASING_TERM and decreasing death benefit", () => {
  assert.equal(mapToAtlasTerm("DECREASING_TERM", "productType"), ATLAS_TERMS.DECREASING_TERM);
  assert.equal(mapToAtlasTerm("decreasing term", "productType"), ATLAS_TERMS.DECREASING_TERM);
  assert.equal(mapToAtlasTerm("term", "productType"), ATLAS_TERMS.TERM_LIFE);
  assert.equal(
    mapToAtlasTerm("decreasing death benefit", "deathBenefitOption"),
    ATLAS_TERMS.DECREASING_DEATH_BENEFIT
  );
});

test("Leidy fixture schedule matches exact verification years", () => {
  const byYear = Object.fromEntries(
    OCCIDENTAL_DECREASING_TERM_LEIDY.deathBenefitSchedule.map((row) => [row.year, row.deathBenefit])
  );
  assert.equal(byYear[0], 290155);
  assert.equal(byYear[10], 257976);
  assert.equal(byYear[20], 212585);
  assert.equal(byYear[30], 148556);
  assert.equal(byYear[40], 58237);
  assert.equal(byYear[44], 24503);
  assert.equal(byYear[45], 0);
  assert.equal(BASE_DEATH_BENEFIT_BY_YEAR.length, 46);
});

test("normalize extract materializes annualValues from deathBenefitSchedule", () => {
  const { annualValues, ...withoutAnnual } = OCCIDENTAL_DECREASING_TERM_LEIDY.extractedData;
  void annualValues;
  const normalized = normalizePolicyExtractionData({
    ...withoutAnnual,
    annualValues: []
  });
  assert.equal(normalized.productType, ATLAS_TERMS.DECREASING_TERM);
  assert.equal(normalized.initialDeathBenefit, 290155);
  assert.equal(normalized.cashValue, 0);
  assert.equal(normalized.deathBenefitSchedule.length, 46);
  assert.equal(normalized.annualValues.length, 46);
  assert.equal(normalized.annualValues.find((row) => row.policyYear === 10).deathBenefit, 257976);
  assert.equal(normalized.annualValues.find((row) => row.policyYear === 45).deathBenefit, 0);
});

test("decreasing term rules emit factual observation codes only", () => {
  const facts = buildInsuranceFactsFromExtract(OCCIDENTAL_DECREASING_TERM_LEIDY.extractedData);
  const execution = executeInsuranceBusinessRules(facts);
  const codes = execution.findings.map((finding) => finding.finding);
  assert.ok(codes.includes("DEATH_BENEFIT_DECREASES_OVER_TIME"));
  assert.ok(codes.includes("NO_CASH_VALUE"));
  assert.ok(codes.includes("COVERAGE_EXPIRES_AT_AGE_70"));
  assert.ok(codes.includes("MONTHLY_PAYMENT_MODE_COSTS_MORE_THAN_ANNUAL_MODE"));
  assert.ok(codes.includes("SPOUSE_COVERAGE_ALSO_DECREASES"));
  for (const finding of execution.findings.filter((item) =>
    String(item.ruleId || "").match(/^PI-01[1-5]$/)
  )) {
    assert.equal(finding.recommendation, null);
  }
});

test("client report snapshot labels decreasing term initial death benefit", () => {
  const report = assembleClientPolicyReport({
    review: { title: OCCIDENTAL_DECREASING_TERM_LEIDY.meta.reviewTitle },
    extractedData: OCCIDENTAL_DECREASING_TERM_LEIDY.extractedData,
    annualValues: {
      timeline: OCCIDENTAL_DECREASING_TERM_LEIDY.annualValues,
      metadata: {}
    }
  });
  assert.equal(report.snapshot.productType, ATLAS_TERMS.DECREASING_TERM);
  assert.equal(report.snapshot.initialDeathBenefit, 290155);
  assert.equal(report.snapshot.cashValue, 0);
  assert.equal(report.snapshot.benefitDeclinesOverTime, true);
  assert.equal(report.snapshot.annualPremiumIfPaidAnnually, 1063.92);
  assert.equal(report.snapshot.annualizedCurrentMode, 1200.12);
  assert.equal(report.snapshot.deathBenefitSchedule.find((row) => row.year === 20).deathBenefit, 212585);
  assert.equal(report.invented, false);
  assert.equal(report.interpolated, false);
});

test("up to 100% acceleration is not a guaranteed 100% cash payment", () => {
  const { createRiderEconomics, buildLivingBenefitCard, VALUE_CLASSIFICATIONS } = require(
    "../modules/policy-intelligence/domain/policy-economics"
  );
  const terminal = OCCIDENTAL_DECREASING_TERM_LEIDY.extractedData.riders.find((rider) =>
    /Terminal Illness/i.test(rider.type)
  );
  assert.ok(terminal);
  assert.equal(terminal.maximumAccelerationPercent, 100);
  assert.equal(terminal.actuarialAdjustment.adjustmentType, "ACTUARIAL_ADJUSTMENT_FACTOR");
  assert.equal(terminal.actuarialAdjustment.displayLabel, "Actuarial Adjustment Factor");
  assert.equal(terminal.actuarialAdjustment.applies, true);
  assert.equal(terminal.actuarialAdjustment.factorDisclosed, false);
  assert.equal(terminal.actuarialAdjustment.formulaDisclosed, false);
  assert.equal(terminal.actuarialAdjustment.administrativeCharge, 100);
  assert.equal(terminal.actuarialAdjustment.uiNote, "Factor/formula not disclosed in policy.");

  const economics = createRiderEconomics(terminal);
  assert.equal(economics.maximumAccelerationPercent, 100);
  assert.equal(economics.discountFactor, null);
  assert.equal(economics.actualCashBenefit, null);
  assert.equal(economics.estimatedActualCashBenefit, null);
  assert.equal(economics.payoutClassification, VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED);
  assert.equal(economics.actuarialAdjustment.factorDisclosed, false);
  assert.equal(economics.actuarialAdjustment.formulaDisclosed, false);

  // Even with face amount available, Atlas must not estimate accelerated cash as 100% of DB.
  const withFace = createRiderEconomics({
    ...terminal,
    deathBenefitElectedForAcceleration: 290155,
    completeCalculationChain: false
  });
  assert.equal(withFace.actualCashBenefit, null);
  assert.notEqual(withFace.actualCashBenefit, 290155);

  const card = buildLivingBenefitCard(economics);
  assert.equal(card.limits.maxAccelerationPercent, 100);
  assert.equal(card.exactPayoutCalculable, false);
  assert.equal(card.carrierCalculationRequired, true);
  assert.equal(card.exactPayout.value, null);
  assert.equal(card.actuarialAdjustment.uiNote, "Factor/formula not disclosed in policy.");
  assert.match(
    String(card.carrierCalculationRequiredText || ""),
    /Exact accelerated benefit cannot be determined/i
  );

  const report = assembleClientPolicyReport({
    review: { title: OCCIDENTAL_DECREASING_TERM_LEIDY.meta.reviewTitle },
    extractedData: OCCIDENTAL_DECREASING_TERM_LEIDY.extractedData,
    annualValues: {
      timeline: OCCIDENTAL_DECREASING_TERM_LEIDY.annualValues,
      metadata: {}
    }
  });
  const terminalCard = report.economics.livingBenefitCards.find((item) =>
    /Terminal Illness/i.test(item.rider || item.type || "")
  );
  assert.ok(terminalCard);
  assert.equal(terminalCard.limits.maxAccelerationPercent, 100);
  assert.equal(terminalCard.exactPayoutCalculable, false);
  assert.equal(terminalCard.exactPayout.value, null);
  assert.equal(terminalCard.actuarialAdjustment.adjustmentType, "ACTUARIAL_ADJUSTMENT_FACTOR");
});
