/**
 * Journey #7 — Production connector registry bootstrap.
 */

const { ConnectorRegistry } = require("./shared/ConnectorRegistry");
const { ConnectorEvent } = require("./shared/ConnectorEvents");
const { HEALTH_STATUS } = require("./shared/ConnectorHealth");
const { MessengerConnector } = require("./meta/MessengerConnector");
const { WhatsAppConnector } = require("./meta/WhatsAppConnector");
const { InstagramConnector } = require("./meta/InstagramConnector");
const { MetaWebhookConnector } = require("./meta/MetaWebhookConnector");
const { GoogleCalendarConnector } = require("./google/GoogleCalendarConnector");
const { ZoomConnector } = require("./zoom/ZoomConnector");

let registryInstance = null;

function registerProductionConnectors(registry, eventBus = null) {
  const connectors = [
    new MessengerConnector({ eventBus }),
    new WhatsAppConnector({ eventBus }),
    new InstagramConnector({ eventBus }),
    new GoogleCalendarConnector({ eventBus }),
    new ZoomConnector({ eventBus })
  ];

  for (const connector of connectors) {
    registry.register(connector);

    eventBus?.emit(ConnectorEvent.CONNECTED, {
      connector: connector.connectorId
    });
  }

  return registry;
}

function createConnectorRegistry(options = {}) {
  const registry = new ConnectorRegistry();
  registerProductionConnectors(registry, options.eventBus || null);
  registryInstance = registry;
  return registry;
}

function getConnectorRegistry() {
  if (!registryInstance) {
    registryInstance = createConnectorRegistry();
  }

  return registryInstance;
}

function resetConnectorRegistry() {
  registryInstance = null;
}

function createMetaWebhookConnector({ gateway, eventBus = null }) {
  return new MetaWebhookConnector({
    connectorRegistry: getConnectorRegistry(),
    gateway,
    eventBus
  });
}

module.exports = {
  ConnectorRegistry,
  ConnectorEvent,
  HEALTH_STATUS,
  MessengerConnector,
  WhatsAppConnector,
  InstagramConnector,
  MetaWebhookConnector,
  GoogleCalendarConnector,
  ZoomConnector,
  createConnectorRegistry,
  getConnectorRegistry,
  resetConnectorRegistry,
  createMetaWebhookConnector,
  registerProductionConnectors
};
