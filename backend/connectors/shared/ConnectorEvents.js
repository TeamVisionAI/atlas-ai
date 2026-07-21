/**
 * Journey #7 — Connector observability event constants.
 */

const ConnectorEvent = Object.freeze({
  CONNECTED: "connector.connected",
  DISCONNECTED: "connector.disconnected",
  HEALTH_CHANGED: "connector.health.changed",
  RETRY: "connector.retry",
  FAILED: "connector.failed",
  MESSAGE_RECEIVED: "connector.message.received",
  MESSAGE_SENT: "connector.message.sent"
});

module.exports = {
  ConnectorEvent
};
