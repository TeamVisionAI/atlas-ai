/**
 * Sprint 5 — Comparison Engine tests (BR-061).
 */

const {
  compareScenarios,
  compareWithStress,
  createPolicyScenario,
  getComparisonCatalog,
  extractScenarioMetrics,
  evaluateIllustratedRateStressComputability,
  ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE,
  STRESS_NOT_COMPUTABLE_MESSAGE,
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

  const csvSide = side.metrics.find((row) => row.metric === "cashSurrenderValue");
  assert(typeof csvSide.scenarioA === "number", "non-stress CSV still present");
  assert(typeof csvSide.scenarioB === "number", "non-stress scenario B CSV still present");
  const dbSide = side.metrics.find((row) => row.metric === "deathBenefit");
  assert(typeof dbSide.scenarioA === "number", "non-stress DB still present");
  assert(typeof dbSide.difference === "number" || dbSide.difference === 0, "non-stress DB difference computed");

  // Independent facts freeze still holds
  const facts = buildInsuranceFactsFromExtract({ carrier: "F&G", productType: "IUL" });
  const frozen = JSON.stringify(facts);
  compareScenarios([current, alt]);
  assert(JSON.stringify(facts) === frozen, "unrelated facts untouched");

  function tryIllustratedRateStress(scenario) {
    try {
      const result = compareWithStress(
        scenario,
        { kind: "illustrated_rate", fromRate: 0.07, toRate: 0.05 },
        { comparisonType: "current_vs_stress" }
      );
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function cloneCurrentWithTimeline(mapRow) {
    return createPolicyScenario({
      id: "current-mutated",
      key: "scenario_a",
      label: "Current Policy",
      type: SCENARIO_TYPES.CURRENT_POLICY,
      insuranceFacts: language.insuranceFacts,
      annualValues: {
        timeline: current.annualValues.timeline.map(mapRow),
        summaryMetrics: current.annualValues.summaryMetrics
      },
      findings: language.findings,
      recommendations: language.recommendations
    });
  }

  // 1. null interestCredited => not computable
  const nullInterest = tryIllustratedRateStress(
    cloneCurrentWithTimeline((row) => ({ ...row, interestCredited: null }))
  );
  assert(nullInterest.ok === false, "null interest fails closed");
  assert(
    nullInterest.error.publicCode === ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE,
    "null interest public code"
  );
  assert(nullInterest.error.details.reasons.includes("INTEREST_CREDITED_UNAVAILABLE"), "interest reason");
  assert(nullInterest.error.message === STRESS_NOT_COMPUTABLE_MESSAGE, "carrier illustration message");

  // 2. null required charges => no synthetic costless policy
  const nullCoi = tryIllustratedRateStress(
    cloneCurrentWithTimeline((row) => ({ ...row, costOfInsurance: null }))
  );
  assert(nullCoi.ok === false, "null COI fails closed");
  assert(nullCoi.error.details.reasons.includes("COST_OF_INSURANCE_UNAVAILABLE"), "COI reason");

  // 3–5 + 8. valid fixture still works; CSV ratio unused; DB not copied; break-even omitted
  const csv = comparison.metrics.find((row) => row.metric === "cashSurrenderValue");
  assert(csv.scenarioA != null, "current CSV remains");
  assert(csv.scenarioB == null, "stressed CSV omitted");
  assert(csv.difference == null, "CSV difference not invented");
  assert(
    stressScenario.annualValues.timeline.every((row) => row.cashSurrenderValue == null),
    "no CSV/AV ratio scaling on stress timeline"
  );

  const db = comparison.metrics.find((row) => row.metric === "deathBenefit");
  assert(db.scenarioB == null, "copied DB is not emitted as stressed output");
  assert(db.difference == null, "DB difference is not a misleading 0");
  assert(
    stressScenario.annualValues.timeline.every((row) => row.deathBenefit == null),
    "stress timeline has no copied death benefit"
  );

  const breakEven = comparison.metrics.find((row) => row.metric === "breakEvenYear");
  assert(breakEven.scenarioB == null, "break-even omitted when stressed CSV unavailable");

  assert(catalog.contracts.illustratedRateStressFailClosed === true, "fail-closed catalog flag");

  // 6. all-null cost series does not summarize to $0
  const sparseAnnual = analyzeAnnualValues([
    { Year: 1, Age: 45, "Premium Outlay": 5000, "Death Benefit": 250000 },
    { Year: 2, Age: 46, "Premium Outlay": 5000, "Death Benefit": 250000 }
  ]);
  const sparseScenario = createPolicyScenario({
    id: "sparse",
    key: "scenario_a",
    type: SCENARIO_TYPES.CURRENT_POLICY,
    insuranceFacts: language.insuranceFacts,
    annualValues: {
      timeline: sparseAnnual.timeline,
      summaryMetrics: sparseAnnual.summaryMetrics
    }
  });
  const sparseMetrics = extractScenarioMetrics(sparseScenario);
  assert(sparseMetrics.totalCoi === null, "all-null COI is NOT_AVAILABLE");
  assert(sparseMetrics.administrativeCharges === null, "all-null admin is NOT_AVAILABLE");
  assert(sparseMetrics.premiumLoads === null, "all-null loads are NOT_AVAILABLE");
  assert(sparseMetrics.riderCharges === null, "all-null rider charges are NOT_AVAILABLE");
  assert(sparseMetrics.totalInternalCharges === null, "all-null internal charges are NOT_AVAILABLE");

  // 7. known National Life bad timeline (rate stored as AV) is rejected
  const nlgBad = [
    {
      policyYear: 1,
      insuredAge: 35,
      annualPremium: 2991.53,
      accountValue: 5.52,
      cashSurrenderValue: 1921,
      deathBenefit: 0,
      interestCredited: 100,
      premiumLoad: 0,
      administrativeCharge: 0,
      costOfInsurance: 0,
      riderCharges: 0
    },
    {
      policyYear: 2,
      insuredAge: 36,
      annualPremium: 2991.53,
      accountValue: 6.05,
      cashSurrenderValue: 3930,
      deathBenefit: 0,
      interestCredited: 100,
      premiumLoad: 0,
      administrativeCharge: 0,
      costOfInsurance: 0,
      riderCharges: 0
    }
  ];
  const nlgGate = evaluateIllustratedRateStressComputability(nlgBad);
  assert(nlgGate.computable === false, "NLG mismatched units are not computable");
  assert(nlgGate.reasons.includes("UNIT_OR_COLUMN_MISMATCH"), "NLG unit mismatch reason");
  const nlgScenario = createPolicyScenario({
    id: "nlg-bad",
    key: "scenario_a",
    type: SCENARIO_TYPES.CURRENT_POLICY,
    insuranceFacts: language.insuranceFacts,
    annualValues: { timeline: nlgBad, summaryMetrics: {} }
  });
  const nlgStress = tryIllustratedRateStress(nlgScenario);
  assert(nlgStress.ok === false, "NLG bad timeline rejected before comparison");
  assert(nlgStress.error.publicCode === ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE, "NLG typed error");

  console.log("comparisonEngine.test.js (BR-061) passed");
}

run();
