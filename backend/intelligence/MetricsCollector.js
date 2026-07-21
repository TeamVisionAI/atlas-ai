/**
 * Release 1.3 — Metrics derived from organization snapshot.
 */

function percent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

/**
 * @param {Object} snapshot
 * @returns {Object}
 */
function collectMetrics(snapshot) {
  const raw = snapshot.packageMetricsRaw || {};
  const gatewayToday = snapshot.workflowActivity?.gatewayInboundToday || [];

  const newConversations = snapshot.openConversations?.length || 0;
  const qualifiedProspects = raw.qualified || 0;
  const interviews = raw.interviews || 0;
  const interviewAttendance = raw.interviewAttendance || 0;
  const presentations = raw.presentations || 0;
  const joined = raw.joined || 0;
  const followUpsStarted = raw.followUpsStarted || 0;
  const followUpsCompleted = raw.followUpsCompleted || 0;
  const licensingStarted = raw.licensingStarted || 0;
  const licensingCompleted = raw.licensingCompleted || 0;
  const fastStartCompleted = raw.fastStartCompleted || 0;

  const connectors = snapshot.connectorHealth || [];
  const enabledConnectors = connectors.length;
  const healthyConnectors = connectors.filter(
    (entry) => entry.health === "connected" || entry.health === "healthy"
  ).length;

  return {
    organizationId: snapshot.organizationId,
    date: snapshot.capturedAt?.slice(0, 10),
    newProspectsToday: gatewayToday.length,
    newConversations,
    qualifiedProspects,
    interviewRate: percent(interviewAttendance, interviews),
    noShowRate: percent(interviews - interviewAttendance, interviews),
    presentationRate: percent(presentations, interviewAttendance),
    joinRate: percent(joined, presentations),
    licensingRate: percent(licensingCompleted, licensingStarted),
    fastStartCompletion: percent(fastStartCompleted, joined),
    followUpCompletion: percent(followUpsCompleted, followUpsStarted),
    connectorUptime: percent(healthyConnectors, enabledConnectors),
    packageActivity: {
      candidates: raw.candidates || 0,
      interviews,
      presentations,
      joined
    },
    appointmentsToday: snapshot.appointments?.today?.length || 0,
    meetingsToday: snapshot.meetings?.today?.length || 0,
    pendingFollowUps: snapshot.followUps?.total || 0,
    openConversations: newConversations,
    activePackages: snapshot.activePackages?.filter((pkg) => pkg.enabled).length || 0,
    offices: snapshot.offices?.length || 0,
    users: snapshot.users?.length || 0
  };
}

module.exports = {
  collectMetrics
};
