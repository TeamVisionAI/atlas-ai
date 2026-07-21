/**
 * Release 1.3 — Actionable recommendations (human approval required).
 */

/**
 * @param {Object} snapshot
 * @param {Object} metrics
 * @param {Object[]} priorities
 * @param {Object[]} insights
 * @returns {Object[]}
 */
function generateRecommendations(snapshot, metrics, priorities, insights) {
  const recommendations = [];

  for (const priority of priorities) {
    switch (priority.category) {
      case "followups":
        recommendations.push({
          id: `rec-${priority.id}`,
          reason: priority.reason,
          priority: priority.level,
          suggestedAction: "Review and complete overdue follow-up sequences",
          affectedWorkflow: "team-vision-recruiting",
          expectedOutcome: "Improved follow-up completion rate",
          confidence: metrics.pendingFollowUps > 3 ? "high" : "medium"
        });
        break;
      case "interviews":
        if (priority.id === "contact-no-shows") {
          recommendations.push({
            id: `rec-${priority.id}`,
            reason: priority.reason,
            priority: "high",
            suggestedAction: "Call no-show prospects and offer rescheduling",
            affectedWorkflow: "team-vision-recruiting",
            expectedOutcome: "Recover missed interview opportunities",
            confidence: "high"
          });
        } else {
          recommendations.push({
            id: `rec-${priority.id}`,
            reason: priority.reason,
            priority: priority.level,
            suggestedAction: "Confirm today's interviews and prepare meeting rooms",
            affectedWorkflow: "team-vision-recruiting",
            expectedOutcome: "Higher interview attendance",
            confidence: "medium"
          });
        }
        break;
      case "licensing":
        recommendations.push({
          id: `rec-${priority.id}`,
          reason: priority.reason,
          priority: priority.level,
          suggestedAction: "Follow up with agents in licensing pipeline",
          affectedWorkflow: "team-vision-recruiting",
          expectedOutcome: "Faster licensing completion",
          confidence: "medium"
        });
        break;
      case "connectors":
        recommendations.push({
          id: `rec-${priority.id}`,
          reason: priority.reason,
          priority: "high",
          suggestedAction: "Verify connector credentials and reconnect integration",
          affectedWorkflow: null,
          expectedOutcome: "Restored channel availability",
          confidence: "high"
        });
        break;
      case "conversations":
        recommendations.push({
          id: `rec-${priority.id}`,
          reason: priority.reason,
          priority: priority.level,
          suggestedAction: "Review stalled conversations and assign operator if needed",
          affectedWorkflow: "team-vision-recruiting",
          expectedOutcome: "Reduced conversation stall time",
          confidence: "medium"
        });
        break;
      default:
        break;
    }
  }

  const decliningInsights = insights.filter(
    (insight) => insight.category === "trend" && insight.severity !== "low"
  );

  for (const insight of decliningInsights.slice(0, 2)) {
    if (recommendations.some((entry) => entry.id === `rec-insight-${insight.id}`)) {
      continue;
    }

    recommendations.push({
      id: `rec-insight-${insight.id}`,
      reason: insight.observation,
      priority: insight.severity === "high" ? "high" : "medium",
      suggestedAction: "Investigate metric decline and adjust workflow configuration",
      affectedWorkflow: "team-vision-recruiting",
      expectedOutcome: "Stabilized performance metrics",
      confidence: "medium"
    });
  }

  const levelOrder = { high: 0, medium: 1, low: 2 };

  return recommendations.sort(
    (left, right) => levelOrder[left.priority] - levelOrder[right.priority]
  );
}

module.exports = {
  generateRecommendations
};
