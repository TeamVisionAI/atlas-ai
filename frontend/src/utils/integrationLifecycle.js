export const INTEGRATION_LIFECYCLE = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting"
});

export function resolveIntegrationLifecycle({
  connected = false,
  connecting = false,
  disconnecting = false
} = {}) {
  if (disconnecting) {
    return INTEGRATION_LIFECYCLE.DISCONNECTING;
  }

  if (connecting) {
    return INTEGRATION_LIFECYCLE.CONNECTING;
  }

  if (connected) {
    return INTEGRATION_LIFECYCLE.CONNECTED;
  }

  return INTEGRATION_LIFECYCLE.DISCONNECTED;
}

export function formatIntegrationDate(value, locale) {
  if (!value) {
    return null;
  }

  try {
    return new Date(value).toLocaleString(locale);
  } catch {
    return value;
  }
}

export function formatWebhookStatus(healthStatus, connected, translate) {
  if (!connected) {
    return null;
  }

  const normalized = String(healthStatus || "healthy").trim().toLowerCase();

  if (normalized === "healthy") {
    return translate("integrationWebhookStatusActive");
  }

  if (normalized === "disconnected") {
    return translate("integrationWebhookStatusDisconnected");
  }

  if (normalized === "error") {
    return translate("integrationWebhookStatusError");
  }

  return translate("integrationWebhookStatusUnknown");
}
