/**
 * Release 1.3 — Observations from snapshot and trends (no recommendations).
 */

function formatMetricLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

/**
 * @param {Object} snapshot
 * @param {Object} metrics
 * @param {Object[]} trends
 * @returns {Object[]}
 */
function generateInsights(snapshot, metrics, trends) {
  const insights = [];

  for (const trend of trends) {
    if (trend.direction === "declining" && trend.previous !== null) {
      insights.push({
        id: `trend-${trend.metric}`,
        category: "trend",
        observation: `${formatMetricLabel(trend.metric)} decreased from ${trend.previous} to ${trend.current}.`,
        metric: trend.metric,
        severity: trend.metric === "connectorUptime" ? "high" : "medium"
      });
    }

    if (trend.direction === "improving" && trend.previous !== null) {
      insights.push({
        id: `trend-${trend.metric}-up`,
        category: "trend",
        observation: `${formatMetricLabel(trend.metric)} improved from ${trend.previous} to ${trend.current}.`,
        metric: trend.metric,
        severity: "low"
      });
    }
  }

  if (metrics.noShowRate >= 20) {
    insights.push({
      id: "interview-attendance",
      category: "interviews",
      observation: `Interview attendance decreased. No-show rate is ${metrics.noShowRate}%.`,
      severity: "high"
    });
  }

  if (metrics.licensingRate >= 50 && trends.find((t) => t.metric === "licensingRate")?.direction === "improving") {
    insights.push({
      id: "licensing-improved",
      category: "licensing",
      observation: "Licensing completion improved compared to prior period.",
      severity: "low"
    });
  }

  if (metrics.followUpCompletion < 70 && metrics.pendingFollowUps > 0) {
    insights.push({
      id: "followups-behind",
      category: "followups",
      observation: `Follow-ups are behind schedule. ${metrics.pendingFollowUps} pending with ${metrics.followUpCompletion}% completion.`,
      severity: "high"
    });
  }

  for (const connector of snapshot.failedConnectors || []) {
    insights.push({
      id: `connector-${connector.id}`,
      category: "connectors",
      observation: `Connector "${connector.id}" is unavailable (${connector.health}).`,
      severity: "high"
    });
  }

  const inactiveOffices = (snapshot.offices || []).filter(
    (office) => office.status === "inactive"
  );

  for (const office of inactiveOffices) {
    insights.push({
      id: `office-${office.id}`,
      category: "offices",
      observation: `Office "${office.name}" is inactive.`,
      severity: "medium"
    });
  }

  if (metrics.appointmentsToday > 0) {
    insights.push({
      id: "appointments-today",
      category: "schedule",
      observation: `${metrics.appointmentsToday} appointment(s) scheduled for today.`,
      severity: "low"
    });
  }

  return insights;
}

module.exports = {
  generateInsights
};
