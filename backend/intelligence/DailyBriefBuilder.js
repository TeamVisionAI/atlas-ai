/**
 * Release 1.3 — Assemble the structured Daily Brief document.
 */

const crypto = require("crypto");

function buildExecutiveSummary(snapshot, metrics, priorities, recommendations) {
  const orgName = snapshot.organization?.profile?.name || "Organization";
  const highPriorityCount = priorities.filter((entry) => entry.level === "high").length;
  const topRecommendation = recommendations[0];

  const lines = [
    `Good morning. Here is your Atlas Daily Brief for ${orgName}.`,
    `${metrics.appointmentsToday} appointment(s) and ${metrics.meetingsToday} meeting(s) scheduled today.`,
    `${metrics.openConversations} open conversation(s) and ${metrics.pendingFollowUps} pending follow-up(s).`
  ];

  if (highPriorityCount > 0) {
    lines.push(`${highPriorityCount} high-priority item(s) require attention today.`);
  }

  return {
    lines,
    recommendedAction: topRecommendation?.suggestedAction || null,
    coachingLeader: orgName
  };
}

function buildOrganizationHealth(snapshot, metrics) {
  const connectors = snapshot.connectorHealth || [];
  const healthy = connectors.filter(
    (entry) => entry.health === "connected" || entry.health === "healthy"
  ).length;

  return {
    score: metrics.connectorUptime,
    status: metrics.connectorUptime >= 80 ? "healthy" : metrics.connectorUptime >= 50 ? "attention" : "critical",
    connectorsHealthy: healthy,
    connectorsTotal: connectors.length,
    activePackages: metrics.activePackages,
    offices: metrics.offices,
    users: metrics.users
  };
}

function buildTodaySchedule(snapshot) {
  return {
    appointments: (snapshot.appointments?.today || []).map((entry) => ({
      id: entry.id,
      prospectName: entry.prospectName,
      startTime: entry.startTime,
      interviewType: entry.interviewType,
      status: entry.status
    })),
    meetings: (snapshot.meetings?.today || []).map((entry) => ({
      id: entry.id,
      prospectName: entry.prospectName,
      startTime: entry.startTime,
      lifecycleStatus: entry.lifecycleStatus
    }))
  };
}

function buildConnectorStatus(snapshot) {
  return (snapshot.connectorHealth || []).map((entry) => ({
    id: entry.id,
    health: entry.health,
    defaultOfficeId: entry.defaultOfficeId
  }));
}

function buildPackageStatus(snapshot) {
  return (snapshot.activePackages || []).map((entry) => ({
    id: entry.id,
    enabled: entry.enabled,
    configured: entry.configured
  }));
}

/**
 * @param {Object} input
 * @returns {Object}
 */
function buildDailyBrief(input) {
  const {
    snapshot,
    metrics,
    trends,
    insights,
    priorities,
    recommendations,
    organizationVersion = 1
  } = input;

  const generatedAt = new Date().toISOString();
  const date = generatedAt.slice(0, 10);

  return {
    id: crypto.randomUUID(),
    organizationId: snapshot.organizationId,
    organization: snapshot.organization?.profile?.name || snapshot.organizationId,
    version: organizationVersion,
    date,
    generatedAt,
    executiveSummary: buildExecutiveSummary(snapshot, metrics, priorities, recommendations),
    organizationHealth: buildOrganizationHealth(snapshot, metrics),
    keyMetrics: metrics,
    trends,
    insights,
    priorities,
    recommendations,
    todaySchedule: buildTodaySchedule(snapshot),
    connectorStatus: buildConnectorStatus(snapshot),
    packageStatus: buildPackageStatus(snapshot)
  };
}

module.exports = {
  buildDailyBrief,
  buildExecutiveSummary,
  buildOrganizationHealth,
  buildTodaySchedule
};
