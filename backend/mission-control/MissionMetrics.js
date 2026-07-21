/**
 * Release 1.4 — Current operational metrics from live Mission State.
 */

function average(values) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function eventsPerMinute(eventTimestamps) {
  const oneMinuteAgo = Date.now() - 60_000;
  return (eventTimestamps || []).filter((timestamp) => new Date(timestamp).getTime() >= oneMinuteAgo)
    .length;
}

function connectorAvailability(connectorStatus) {
  const connectors = Object.values(connectorStatus || {});

  if (!connectors.length) {
    return 100;
  }

  const available = connectors.filter((entry) => entry.available).length;
  return Math.round((available / connectors.length) * 100);
}

/**
 * @param {Object} state
 * @returns {Object}
 */
function calculateMissionMetrics(state) {
  const activeConversations = Object.keys(state.activeConversations || {}).length;
  const runningWorkflows = Object.keys(state.runningWorkflows || {}).length;

  return {
    organizationId: state.organizationId,
    activeConversations,
    averageResponseTimeMs: average(state.responseSamples || []),
    appointmentsScheduled: state.appointmentsToday || 0,
    meetingsRunning: state.meetingsToday?.running || 0,
    meetingsCompleted: state.meetingsToday?.completed || 0,
    workflowCompletion: runningWorkflows,
    packageActivity: Object.values(state.packageActivity || {}).reduce(
      (sum, entry) => sum + (entry.events || 0),
      0
    ),
    connectorAvailability: connectorAvailability(state.connectorStatus),
    agentAvailability: state.agentStatus?.available ? 100 : 0,
    eventsPerMinute: eventsPerMinute(state.eventTimestamps),
    pendingTasks: state.pendingTasks || 0,
    waitingCustomers: (state.waitingCustomers || []).length,
    licensingInProgress: Math.max(
      0,
      (state.licensingPipeline?.started || 0) - (state.licensingPipeline?.completed || 0)
    )
  };
}

module.exports = {
  calculateMissionMetrics
};
