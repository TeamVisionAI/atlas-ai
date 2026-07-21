/**
 * Release 1.4 — Lightweight operational snapshot.
 */

const { calculateMissionMetrics } = require("./MissionMetrics");
const { generateMissionAlerts } = require("./MissionAlerts");
const { calculateMissionHealth } = require("./MissionHealth");

/**
 * @param {Object} input
 * @param {Object} input.state
 * @param {Object[]} [input.timeline]
 * @param {string} [input.organizationName]
 */
function buildMissionSnapshot(input) {
  const { state, timeline = [], organizationName = null } = input;
  const metrics = calculateMissionMetrics(state);
  const alerts = generateMissionAlerts(state, metrics);
  const health = calculateMissionHealth(state, metrics);

  return {
    organizationId: state.organizationId,
    organization: organizationName || state.organizationId,
    timestamp: new Date().toISOString(),
    conversationSummary: {
      active: Object.keys(state.activeConversations || {}).length,
      waiting: (state.waitingCustomers || []).length
    },
    workflowSummary: {
      running: Object.keys(state.runningWorkflows || {}).length,
      failures: state.workflowFailures || 0
    },
    connectorSummary: state.connectorStatus || {},
    healthSummary: health,
    alerts,
    currentMetrics: metrics,
    activeUsers: state.activeUsers || [],
    packages: state.packages || [],
    timeline: timeline.slice(0, 50)
  };
}

module.exports = {
  buildMissionSnapshot
};
