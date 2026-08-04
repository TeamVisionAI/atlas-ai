/**
 * Canonical educational projection assumptions (RC3).
 * Hypothetical · non-guaranteed · not suitability advice.
 */

const PROJECTION_SCENARIOS = Object.freeze({
  CONSERVATIVE: Object.freeze({
    id: "conservative",
    label: "Conservative",
    annualReturn: 0.04,
    riskDescription:
      "Illustration favoring reduced volatility and greater stability. Hypothetical and non-guaranteed.",
    allocationCategory: "Stability-oriented model category"
  }),
  MODERATE: Object.freeze({
    id: "moderate_growth",
    label: "Moderate Growth",
    annualReturn: 0.07,
    riskDescription:
      "Illustration balancing long-term growth and volatility. Hypothetical and non-guaranteed.",
    allocationCategory: "Balanced growth model category"
  }),
  AGGRESSIVE: Object.freeze({
    id: "aggressive_growth",
    label: "Aggressive Growth",
    annualReturn: 0.1,
    riskDescription:
      "Illustration assuming greater market volatility for a longer horizon. Hypothetical and non-guaranteed.",
    allocationCategory: "Growth-oriented model category"
  })
});

const PROJECTION_DISCLAIMER = Object.freeze({
  hypothetical: true,
  educational: true,
  guaranteed: false,
  methodology:
    "Future value of an ordinary annuity with monthly contributions and monthly compounding. Figures are before investment fees, expenses, taxes, and inflation unless separately disclosed.",
  caveats:
    "Fees, expenses, taxes, inflation, market losses, and contribution interruptions can materially affect actual results. Not a promise of performance."
});

function listProjectionScenarios() {
  return Object.values(PROJECTION_SCENARIOS);
}

function getProjectionScenario(id) {
  return listProjectionScenarios().find((item) => item.id === id) || null;
}

module.exports = {
  PROJECTION_SCENARIOS,
  PROJECTION_DISCLAIMER,
  listProjectionScenarios,
  getProjectionScenario
};
