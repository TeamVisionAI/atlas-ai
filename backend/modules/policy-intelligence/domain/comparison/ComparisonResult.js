/**
 * Canonical ComparisonResult (Sprint 5 / BR-061).
 */

const { METRIC_DIRECTIONS } = require("./comparisonMetrics");

function round(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function resolveWinner(metricDef, valuesByScenarioKey, scenarioKeys) {
  if (!metricDef || metricDef.direction === METRIC_DIRECTIONS.NEUTRAL) {
    return null;
  }

  const numeric = scenarioKeys
    .map((key) => ({ key, value: valuesByScenarioKey[key] }))
    .filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value));

  if (numeric.length < 2) {
    return null;
  }

  let best = numeric[0];
  for (const entry of numeric.slice(1)) {
    if (metricDef.direction === METRIC_DIRECTIONS.LOWER_BETTER) {
      if (entry.value < best.value) {
        best = entry;
      }
    } else if (metricDef.direction === METRIC_DIRECTIONS.HIGHER_BETTER) {
      if (entry.value > best.value) {
        best = entry;
      }
    }
  }

  const ties = numeric.filter((entry) => entry.value === best.value);
  if (ties.length > 1) {
    return null;
  }

  return best.key;
}

/**
 * Pairwise comparison row for Scenario A vs Scenario B (primary pair).
 * Also includes values for all scenarios when more than two.
 */
function createComparisonMetricRow({
  metric,
  valuesByScenarioKey,
  scenarioKeys,
  primaryA,
  primaryB
}) {
  const valueA = valuesByScenarioKey[primaryA] ?? null;
  const valueB = valuesByScenarioKey[primaryB] ?? null;

  let difference = null;
  let percentageDifference = null;

  if (typeof valueA === "number" && typeof valueB === "number") {
    difference = round(valueB - valueA);
    if (valueA !== 0) {
      percentageDifference = round(((valueB - valueA) / Math.abs(valueA)) * 100, 2);
    } else if (valueB === 0) {
      percentageDifference = 0;
    } else {
      percentageDifference = null;
    }
  }

  const winner = resolveWinner(metric, valuesByScenarioKey, scenarioKeys);

  return Object.freeze({
    metric: metric.id,
    label: metric.label,
    unit: metric.unit,
    direction: metric.direction,
    scenarioA: valueA,
    scenarioB: valueB,
    values: Object.freeze({ ...valuesByScenarioKey }),
    difference,
    percentageDifference,
    winner
  });
}

function createComparisonResult({
  comparisonType,
  scenarios,
  rows,
  timelineComparison,
  metadata = {}
}) {
  return Object.freeze({
    comparisonType: comparisonType.id,
    comparisonTypeLabel: comparisonType.label,
    scenarios: Object.freeze(
      scenarios.map((scenario) =>
        Object.freeze({
          id: scenario.id,
          key: scenario.key,
          label: scenario.label,
          type: scenario.type,
          stress: scenario.stress || null
        })
      )
    ),
    primaryPair: Object.freeze({
      scenarioA: scenarios[0]?.key || null,
      scenarioB: scenarios[1]?.key || null
    }),
    metrics: Object.freeze(rows),
    timelineComparison: Object.freeze(timelineComparison || []),
    summary: Object.freeze({
      metricCount: rows.length,
      scenarioCount: scenarios.length,
      winners: Object.freeze(
        rows.reduce((acc, row) => {
          if (row.winner) {
            acc[row.metric] = row.winner;
          }
          return acc;
        }, {})
      )
    }),
    metadata: Object.freeze({
      engine: "comparison_engine",
      version: "1.0",
      deterministic: true,
      ai: false,
      ocr: false,
      createsFacts: false,
      ...metadata
    })
  });
}

module.exports = {
  createComparisonMetricRow,
  createComparisonResult,
  resolveWinner
};
