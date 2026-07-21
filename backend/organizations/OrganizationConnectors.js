/**
 * Release 1.2 — Connector settings per organization.
 */

const CONNECTOR_IDS = Object.freeze([
  "messenger",
  "whatsapp",
  "instagram",
  "google-calendar",
  "zoom"
]);

function createDefaultConnectors() {
  return CONNECTOR_IDS.reduce((acc, connectorId) => {
    acc[connectorId] = {
      connectorId,
      enabled: false,
      credentialsRef: null,
      health: "disconnected",
      defaultOfficeId: null
    };
    return acc;
  }, {});
}

function configureConnector(connectors, connectorId, patch = {}) {
  if (!connectors[connectorId]) {
    throw new Error(`Unknown connector: ${connectorId}`);
  }

  return {
    ...connectors,
    [connectorId]: {
      ...connectors[connectorId],
      ...patch,
      connectorId
    }
  };
}

function enabledConnectors(connectors = {}) {
  return Object.values(connectors).filter((entry) => entry.enabled);
}

module.exports = {
  CONNECTOR_IDS,
  createDefaultConnectors,
  configureConnector,
  enabledConnectors
};
