/**
 * Comparison metric registry (Sprint 5 / BR-061).
 * Extensible — future comparison types register additional metrics here.
 */

const { SCENARIO_TYPES } = require("./scenarioModel");

const METRIC_DIRECTIONS = Object.freeze({
  LOWER_BETTER: "lower_better",
  HIGHER_BETTER: "higher_better",
  NEUTRAL: "neutral"
});

const COMPARISON_METRICS = Object.freeze({
  ANNUAL_PREMIUM: Object.freeze({
    id: "annualPremium",
    label: "Annual Premium",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  LIFETIME_PREMIUM: Object.freeze({
    id: "lifetimePremium",
    label: "Lifetime Premium",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  TOTAL_COI: Object.freeze({
    id: "totalCoi",
    label: "Total COI",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  ADMINISTRATIVE_CHARGES: Object.freeze({
    id: "administrativeCharges",
    label: "Administrative Charges",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  PREMIUM_LOADS: Object.freeze({
    id: "premiumLoads",
    label: "Premium Loads",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  RIDER_CHARGES: Object.freeze({
    id: "riderCharges",
    label: "Rider Charges",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  TOTAL_INTERNAL_CHARGES: Object.freeze({
    id: "totalInternalCharges",
    label: "Total Internal Charges",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "currency"
  }),
  CASH_VALUE: Object.freeze({
    id: "cashValue",
    label: "Cash Value",
    direction: METRIC_DIRECTIONS.HIGHER_BETTER,
    unit: "currency"
  }),
  CASH_SURRENDER_VALUE: Object.freeze({
    id: "cashSurrenderValue",
    label: "Cash Surrender Value",
    direction: METRIC_DIRECTIONS.HIGHER_BETTER,
    unit: "currency"
  }),
  DEATH_BENEFIT: Object.freeze({
    id: "deathBenefit",
    label: "Death Benefit",
    direction: METRIC_DIRECTIONS.HIGHER_BETTER,
    unit: "currency"
  }),
  BREAK_EVEN_YEAR: Object.freeze({
    id: "breakEvenYear",
    label: "Break-even Year",
    direction: METRIC_DIRECTIONS.LOWER_BETTER,
    unit: "year"
  }),
  GUARANTEED_DURATION: Object.freeze({
    id: "guaranteedDuration",
    label: "Guaranteed Duration",
    direction: METRIC_DIRECTIONS.HIGHER_BETTER,
    unit: "years"
  }),
  ILLUSTRATED_DURATION: Object.freeze({
    id: "illustratedDuration",
    label: "Illustrated Duration",
    direction: METRIC_DIRECTIONS.NEUTRAL,
    unit: "years"
  }),
  POLICY_DURATION: Object.freeze({
    id: "policyDuration",
    label: "Policy Duration",
    direction: METRIC_DIRECTIONS.NEUTRAL,
    unit: "years"
  })
});

const DEFAULT_METRIC_ORDER = Object.freeze(
  Object.values(COMPARISON_METRICS).map((metric) => metric.id)
);

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lastTimelineRow(scenario) {
  const timeline = scenario?.annualValues?.timeline || [];
  return timeline.length ? timeline[timeline.length - 1] : null;
}

function firstPremium(scenario) {
  const timeline = scenario?.annualValues?.timeline || [];
  for (const row of timeline) {
    if (typeof row.annualPremium === "number") {
      return row.annualPremium;
    }
  }
  return asNumber(scenario?.insuranceFacts?.premium?.amount);
}

/**
 * Extract a flat metric map from a scenario (Facts + Annual Values only).
 */
function extractScenarioMetrics(scenario) {
  const facts = scenario?.insuranceFacts || {};
  const summary = scenario?.annualValues?.summaryMetrics || {};
  const last = lastTimelineRow(scenario);

  return Object.freeze({
    annualPremium: firstPremium(scenario),
    lifetimePremium: asNumber(summary.totalPremiumsPaid),
    totalCoi: asNumber(summary.totalCostOfInsurance),
    administrativeCharges: asNumber(summary.totalAdministrativeCharges),
    premiumLoads: asNumber(summary.totalPremiumLoads),
    riderCharges: asNumber(summary.totalRiderCharges),
    totalInternalCharges: asNumber(summary.totalInternalCharges),
    cashValue: asNumber(last?.cashValue ?? summary.cashValueAtAge65),
    cashSurrenderValue: asNumber(last?.cashSurrenderValue),
    deathBenefit:
      scenario?.type === SCENARIO_TYPES.STRESS_TEST ||
      scenario?.type === SCENARIO_TYPES.ALTERNATIVE_FUNDING
        ? asNumber(last?.deathBenefit)
        : asNumber(last?.deathBenefit ?? facts.faceAmount),
    breakEvenYear: asNumber(summary.breakEvenYear),
    guaranteedDuration: asNumber(facts.guaranteedDuration),
    illustratedDuration: asNumber(facts.illustratedDuration),
    policyDuration: asNumber(summary.policyDuration)
  });
}

module.exports = {
  METRIC_DIRECTIONS,
  COMPARISON_METRICS,
  DEFAULT_METRIC_ORDER,
  extractScenarioMetrics
};
