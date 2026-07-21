/**
 * Release 1.4 — Operational alert generation.
 */

const crypto = require("crypto");

/**
 * @param {Object} state
 * @param {Object} metrics
 * @returns {Object[]}
 */
function generateMissionAlerts(state, metrics) {
  const alerts = [];
  const timestamp = new Date().toISOString();

  for (const [connectorId, status] of Object.entries(state.connectorStatus || {})) {
    if (!status.available) {
      alerts.push({
        id: crypto.randomUUID(),
        severity: "critical",
        reason: `Connector ${connectorId} is offline`,
        affectedComponent: connectorId,
        suggestedAction: "Verify connector credentials and reconnect",
        timestamp,
        organizationId: state.organizationId
      });
    }
  }

  if (metrics.waitingCustomers >= 5) {
    alerts.push({
      id: crypto.randomUUID(),
      severity: "high",
      reason: "Large waiting queue detected",
      affectedComponent: "conversations",
      suggestedAction: "Assign operators to waiting conversations",
      timestamp,
      organizationId: state.organizationId
    });
  }

  if (metrics.pendingTasks >= 3) {
    alerts.push({
      id: crypto.randomUUID(),
      severity: "medium",
      reason: "Follow-up backlog growing",
      affectedComponent: "followups",
      suggestedAction: "Complete pending follow-up tasks",
      timestamp,
      organizationId: state.organizationId
    });
  }

  if ((state.workflowFailures || 0) >= 1) {
    alerts.push({
      id: crypto.randomUUID(),
      severity: "high",
      reason: "Workflow failures detected",
      affectedComponent: "workflow-engine",
      suggestedAction: "Review failed workflow executions",
      timestamp,
      organizationId: state.organizationId
    });
  }

  if (metrics.connectorAvailability < 100 && metrics.connectorAvailability > 0) {
    alerts.push({
      id: crypto.randomUUID(),
      severity: "warning",
      reason: "Some connectors are degraded",
      affectedComponent: "connectors",
      suggestedAction: "Review connector health dashboard",
      timestamp,
      organizationId: state.organizationId
    });
  }

  if (!state.packages?.length) {
    alerts.push({
      id: crypto.randomUUID(),
      severity: "warning",
      reason: "No active packages installed",
      affectedComponent: "packages",
      suggestedAction: "Install and enable an organization package",
      timestamp,
      organizationId: state.organizationId
    });
  }

  if (!state.organizationActivity?.lastEventAt) {
    alerts.push({
      id: crypto.randomUUID(),
      severity: "warning",
      reason: "Organization inactive",
      affectedComponent: "organization",
      suggestedAction: "Verify organization configuration and event subscriptions",
      timestamp,
      organizationId: state.organizationId
    });
  }

  return alerts;
}

module.exports = {
  generateMissionAlerts
};
