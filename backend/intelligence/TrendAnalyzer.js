/**
 * Release 1.3 — Compare today's metrics with historical data.
 */

const METRIC_KEYS = [
  "newProspectsToday",
  "newConversations",
  "qualifiedProspects",
  "interviewRate",
  "noShowRate",
  "presentationRate",
  "joinRate",
  "licensingRate",
  "fastStartCompletion",
  "followUpCompletion",
  "connectorUptime"
];

const INVERSE_METRICS = new Set(["noShowRate"]);

function compareValue(current, previous) {
  if (previous === undefined || previous === null) {
    return "stable";
  }

  if (current > previous) {
    return "improving";
  }

  if (current < previous) {
    return "declining";
  }

  return "stable";
}

function trendDirection(key, current, previous) {
  const direction = compareValue(current, previous);

  if (INVERSE_METRICS.has(key)) {
    if (direction === "improving") {
      return "declining";
    }

    if (direction === "declining") {
      return "improving";
    }
  }

  return direction;
}

/**
 * @param {Object} currentMetrics
 * @param {Object[]} history - prior metrics entries (newest first)
 * @returns {Object[]}
 */
function analyzeTrends(currentMetrics, history = []) {
  const previous = history[0];

  if (!previous) {
    return METRIC_KEYS.map((key) => ({
      metric: key,
      current: currentMetrics[key],
      previous: null,
      direction: "stable"
    }));
  }

  return METRIC_KEYS.map((key) => ({
    metric: key,
    current: currentMetrics[key],
    previous: previous[key] ?? null,
    direction: trendDirection(key, currentMetrics[key], previous[key])
  }));
}

module.exports = {
  analyzeTrends,
  METRIC_KEYS
};
