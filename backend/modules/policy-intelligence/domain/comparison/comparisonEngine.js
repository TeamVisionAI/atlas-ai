/**
 * Policy Intelligence Comparison Engine (Sprint 5 / BR-061).
 *
 * Calculations only. No AI. No OCR.
 * Consumes Insurance Facts, Annual Values, Findings, Recommendations.
 * Does NOT generate or mutate Insurance Facts.
 */

const {
  COMPARISON_METRICS,
  DEFAULT_METRIC_ORDER,
  extractScenarioMetrics
} = require("./comparisonMetrics");
const { createComparisonMetricRow, createComparisonResult } = require("./ComparisonResult");
const { resolveComparisonType, listComparisonTypes } = require("./comparisonTypes");
const { createPolicyScenario, SCENARIO_TYPES, SCENARIO_LABELS } = require("./scenarioModel");
const { buildStressScenario, STRESS_KINDS } = require("./stressScenarios");

function buildTimelineComparison(scenarios) {
  const byYear = new Map();

  scenarios.forEach((scenario, index) => {
    const key = scenario.key || `scenario_${index}`;
    for (const row of scenario.annualValues?.timeline || []) {
      if (row.policyYear == null) {
        continue;
      }
      const entry = byYear.get(row.policyYear) || {
        policyYear: row.policyYear,
        insuredAge: row.insuredAge ?? null,
        scenarios: {}
      };
      if (entry.insuredAge == null && row.insuredAge != null) {
        entry.insuredAge = row.insuredAge;
      }
      entry.scenarios[key] = {
        cashValue: row.cashValue ?? null,
        cashSurrenderValue: row.cashSurrenderValue ?? null,
        deathBenefit: row.deathBenefit ?? null,
        annualPremium: row.annualPremium ?? null,
        netCashValue: row.netCashValue ?? null
      };
      byYear.set(row.policyYear, entry);
    }
  });

  return [...byYear.values()]
    .sort((a, b) => a.policyYear - b.policyYear)
    .map((row) => Object.freeze({
      policyYear: row.policyYear,
      insuredAge: row.insuredAge,
      scenarios: Object.freeze({ ...row.scenarios })
    }));
}

/**
 * Compare two or more scenarios.
 * @param {Array<object>} scenarios - createPolicyScenario outputs
 * @param {{ comparisonType?: string, metricIds?: string[] }} [options]
 */
function compareScenarios(scenarios = [], options = {}) {
  const started = process.hrtime.bigint();
  const comparisonType = resolveComparisonType(options.comparisonType);
  const list = Array.isArray(scenarios) ? scenarios.filter(Boolean) : [];

  if (list.length < comparisonType.minScenarios) {
    const error = new Error(
      `Comparison type ${comparisonType.id} requires at least ${comparisonType.minScenarios} scenarios.`
    );
    error.statusCode = 400;
    error.publicCode = "COMPARISON_SCENARIOS_REQUIRED";
    throw error;
  }

  if (list.length > comparisonType.maxScenarios) {
    const error = new Error(
      `Comparison type ${comparisonType.id} supports at most ${comparisonType.maxScenarios} scenarios.`
    );
    error.statusCode = 400;
    error.publicCode = "COMPARISON_TOO_MANY_SCENARIOS";
    throw error;
  }

  const scenarioKeys = list.map((scenario, index) => scenario.key || `scenario_${index}`);
  const metricsByScenario = list.map((scenario) => extractScenarioMetrics(scenario));
  const metricIds = Array.isArray(options.metricIds) && options.metricIds.length
    ? options.metricIds
    : DEFAULT_METRIC_ORDER;

  const primaryA = scenarioKeys[0];
  const primaryB = scenarioKeys[1];

  const rows = metricIds
    .map((metricId) => {
      const metric =
        Object.values(COMPARISON_METRICS).find((item) => item.id === metricId) || null;
      if (!metric) {
        return null;
      }

      const valuesByScenarioKey = {};
      scenarioKeys.forEach((key, index) => {
        valuesByScenarioKey[key] = metricsByScenario[index][metric.id] ?? null;
      });

      return createComparisonMetricRow({
        metric,
        valuesByScenarioKey,
        scenarioKeys,
        primaryA,
        primaryB
      });
    })
    .filter(Boolean);

  const ended = process.hrtime.bigint();

  return createComparisonResult({
    comparisonType,
    scenarios: list,
    rows,
    timelineComparison: buildTimelineComparison(list),
    metadata: {
      executionTimeMs: Number((Number(ended - started) / 1e6).toFixed(3)),
      metricIds: Object.freeze([...metricIds])
    }
  });
}

/**
 * Convenience: compare base vs deterministic stress scenario.
 */
function compareWithStress(baseScenario, stressSpec = {}, options = {}) {
  const stressScenario = buildStressScenario(baseScenario, stressSpec);
  return {
    stressScenario,
    comparison: compareScenarios([baseScenario, stressScenario], {
      comparisonType: options.comparisonType || "current_vs_stress",
      metricIds: options.metricIds
    })
  };
}

function getComparisonCatalog() {
  return {
    engine: "comparison_engine",
    version: "1.0",
    scenarioTypes: SCENARIO_TYPES,
    scenarioLabels: SCENARIO_LABELS,
    comparisonTypes: listComparisonTypes(),
    metrics: Object.values(COMPARISON_METRICS),
    stressKinds: STRESS_KINDS,
    contracts: {
      createsFacts: false,
      factsImmutable: true,
      ai: false,
      ocr: false,
      calculationsOnly: true,
      consumes: ["insuranceFacts", "annualValues", "findings", "recommendations"]
    }
  };
}

module.exports = {
  compareScenarios,
  compareWithStress,
  getComparisonCatalog,
  createPolicyScenario,
  buildStressScenario,
  extractScenarioMetrics,
  SCENARIO_TYPES,
  STRESS_KINDS
};
