/**
 * Release 1.3 — Rank today's priorities.
 */

/**
 * @param {Object} snapshot
 * @param {Object} metrics
 * @param {Object[]} insights
 * @returns {Object[]}
 */
function determinePriorities(snapshot, metrics, insights) {
  const priorities = [];

  if (metrics.pendingFollowUps > 0) {
    priorities.push({
      id: "followups-overdue",
      title: "Complete pending follow-ups",
      reason: `${metrics.pendingFollowUps} follow-up(s) awaiting action`,
      level: metrics.followUpCompletion < 50 ? "high" : "medium",
      category: "followups"
    });
  }

  const pendingInterviews = snapshot.appointments?.pending?.length || 0;

  if (pendingInterviews > 0) {
    priorities.push({
      id: "pending-interviews",
      title: "Complete pending interviews",
      reason: `${pendingInterviews} interview(s) scheduled`,
      level: metrics.appointmentsToday > 0 ? "high" : "medium",
      category: "interviews"
    });
  }

  if (metrics.licensingRate < 100 && snapshot.licensingProgress?.started > snapshot.licensingProgress?.completed) {
    priorities.push({
      id: "licensing-in-progress",
      title: "Finish licensing for new agents",
      reason: `${snapshot.licensingProgress.started - snapshot.licensingProgress.completed} licensing case(s) in progress`,
      level: "medium",
      category: "licensing"
    });
  }

  for (const connector of snapshot.failedConnectors || []) {
    priorities.push({
      id: `reconnect-${connector.id}`,
      title: `Reconnect ${connector.id} connector`,
      reason: `Connector health is ${connector.health}`,
      level: "high",
      category: "connectors"
    });
  }

  if (metrics.noShowRate >= 15) {
    priorities.push({
      id: "contact-no-shows",
      title: "Contact no-show prospects",
      reason: `No-show rate is ${metrics.noShowRate}%`,
      level: "high",
      category: "interviews"
    });
  }

  if (metrics.openConversations > 5) {
    priorities.push({
      id: "review-conversations",
      title: "Review open conversations",
      reason: `${metrics.openConversations} active conversation(s) need attention`,
      level: "medium",
      category: "conversations"
    });
  }

  const levelOrder = { high: 0, medium: 1, low: 2 };

  return priorities.sort((left, right) => levelOrder[left.level] - levelOrder[right.level]);
}

module.exports = {
  determinePriorities
};
