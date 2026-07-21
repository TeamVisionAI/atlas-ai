/**
 * Release 1.4 — Component health calculations.
 */

const HEALTH = Object.freeze({
  HEALTHY: "healthy",
  WARNING: "warning",
  CRITICAL: "critical",
  UNAVAILABLE: "unavailable"
});

function scoreFromAvailability(availability) {
  if (availability >= 90) {
    return HEALTH.HEALTHY;
  }

  if (availability >= 50) {
    return HEALTH.WARNING;
  }

  if (availability > 0) {
    return HEALTH.CRITICAL;
  }

  return HEALTH.UNAVAILABLE;
}

/**
 * @param {Object} state
 * @param {Object} metrics
 * @returns {Object}
 */
function calculateMissionHealth(state, metrics) {
  const connectorValues = Object.values(state.connectorStatus || {});
  const connectorAvailability =
    connectorValues.length === 0
      ? 100
      : Math.round(
          (connectorValues.filter((entry) => entry.available).length / connectorValues.length) * 100
        );

  const health = {
    atlas: HEALTH.HEALTHY,
    agent: state.agentStatus?.available ? HEALTH.HEALTHY : HEALTH.WARNING,
    gateway: metrics.eventsPerMinute > 0 ? HEALTH.HEALTHY : HEALTH.WARNING,
    packages: state.packages?.length ? HEALTH.HEALTHY : HEALTH.WARNING,
    connectors: scoreFromAvailability(connectorAvailability),
    organization: state.organizationActivity?.lastEventAt ? HEALTH.HEALTHY : HEALTH.WARNING,
    businessServices: metrics.pendingTasks > 5 ? HEALTH.WARNING : HEALTH.HEALTHY,
    workflowEngine: (state.workflowFailures || 0) > 0 ? HEALTH.CRITICAL : HEALTH.HEALTHY
  };

  const statuses = Object.values(health);

  if (statuses.includes(HEALTH.UNAVAILABLE) || statuses.includes(HEALTH.CRITICAL)) {
    health.atlas = HEALTH.CRITICAL;
  } else if (statuses.includes(HEALTH.WARNING)) {
    health.atlas = HEALTH.WARNING;
  }

  return health;
}

module.exports = {
  HEALTH,
  calculateMissionHealth
};
