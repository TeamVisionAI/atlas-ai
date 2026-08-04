/**
 * Sprint 5 — Comparison Engine tests (BR-061).
 */

const {
  compareScenarios,
  compareWithStress,
  createPolicyScenario,
  getComparisonCatalog,
  SCENARIO_TYPES
} = require("./comparisonEngine");
const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");
const { FG_ILLUSTRATION_ANNUAL_VALUES } = require("../annual-values/fixtures/fgIllustrationAnnualValues");
const { buildInsuranceFactsFromExtract } = require("../insurance-language/InsuranceFacts");
const { analyzeInsuranceLanguage } = require("../insurance-language/languageLayer");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const catalog = getComparisonCatalog();
  assert(catalog.contracts.createsFacts === false, "does not create facts");
  assert(catalog.contracts.ai === false, "no AI");
  assert(catalog.comparisonTypes.length >= 3, "extensible comparison types");
  assert(catalog.metrics.some((metric) => metric.id === "totalInternalCharges"), "internal charges metric");

  const annual = analyzeAnnualValues(FG_ILLUSTRATION_ANNUAL_VALUES.rows);
  const language = analyzeInsuranceLanguage({
    carrier: "F&G",
    productType: "IUL",
    illustratedRate: 0.07,
    guaranteedDuration: 20,
    illustratedDuration: 40,
    insured: { issueAge: 40, gender: "Male", underwritingClass: "Preferred NT" },
    faceAmount: 500000,
    premium: { amount: 12000, frequency: "annual" },
    annualValues: FG_ILLUSTRATION_ANNUAL_VALUES.rows
  });

  const factsBefore = JSON.stringify(language.insuranceFacts);

  const current = createPolicyScenario({
    id: "current",
    key: "scenario_a",
    label: "Current Policy",
    type: SCENARIO_TYPES.CURRENT_POLICY,
    insuranceFacts: language.insuranceFacts,
    annualValues: {
      timeline: annual.timeline,
      summaryMetrics: annual.summaryMetrics
    },
    findings: language.findings,
    recommendations: language.recommendations
  });

  const { stressScenario, comparison } = compareWithStress(
    current,
    { kind: "illustrated_rate", fromRate: 0.07, toRate: 0.05 },
    { comparisonType: "current_vs_stress" }
  );

  assert(stressScenario.type === SCENARIO_TYPES.STRESS_TEST, "stress type");
  assert(stressScenario.stress.kind === "illustrated_rate", "stress kind");
  assert(comparison.comparisonType === "current_vs_stress", "comparison type");
  assert(comparison.metrics.length >= 10, "metric rows present");
  assert(comparison.timelineComparison.length > 0, "timeline comparison");

  const lifetime = comparison.metrics.find((row) => row.metric === "lifetimePremium");
  assert(lifetime, "lifetime premium row");
  assert(lifetime.scenarioA != null, "scenario A value");
  assert(lifetime.scenarioB != null, "scenario B value");
  assert(typeof lifetime.difference === "number", "difference numeric");
  assert(
    lifetime.percentageDifference == null || typeof lifetime.percentageDifference === "number",
    "percentage difference"
  );
  assert(
    lifetime.winner === null ||
      lifetime.winner === "scenario_a" ||
      lifetime.winner === "scenario_stress_rate",
    "winner key valid"
  );

  const cash = comparison.metrics.find((row) => row.metric === "cashValue");
  assert(cash.scenarioB < cash.scenarioA, "5% stress reduces cash value vs 7% path");

  // Facts immutable — comparison/stress must not mutate source facts object
  assert(JSON.stringify(language.insuranceFacts) === factsBefore, "source facts unchanged");

  const funding = compareWithStress(current, {
    kind: "minimum_funding",
    fundingRatio: 0.5
  });
  assert(funding.stressScenario.type === SCENARIO_TYPES.ALTERNATIVE_FUNDING, "funding scenario");
  const premiumRow = funding.comparison.metrics.find((row) => row.metric === "annualPremium");
  assert(premiumRow.scenarioB < premiumRow.scenarioA, "minimum funding lowers annual premium");

  // Side-by-side alternative strategy (same model, different label)
  const alt = createPolicyScenario({
    id: "alt",
    key: "scenario_b",
    label: "Alternative Strategy",
    type: SCENARIO_TYPES.ALTERNATIVE_STRATEGY,
    insuranceFacts: {
      ...language.insuranceFacts,
      illustratedDuration: 35
    },
    annualValues: {
      timeline: annual.timeline,
      summaryMetrics: annual.summaryMetrics
    },
    findings: language.findings,
    recommendations: language.recommendations
  });

  const side = compareScenarios([current, alt], {
    comparisonType: "current_iul_vs_alternative"
  });
  assert(side.comparisonType === "current_iul_vs_alternative", "future type works");
  assert(side.primaryPair.scenarioA === "scenario_a", "primary A");
  assert(side.primaryPair.scenarioB === "scenario_b", "primary B");

  // Independent facts freeze still holds
  const facts = buildInsuranceFactsFromExtract({ carrier: "F&G", productType: "IUL" });
  const frozen = JSON.stringify(facts);
  compareScenarios([current, alt]);
  assert(JSON.stringify(facts) === frozen, "unrelated facts untouched");

  console.log("comparisonEngine.test.js (BR-061) passed");
}

run();
