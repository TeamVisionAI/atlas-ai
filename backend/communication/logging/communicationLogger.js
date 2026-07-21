/**
 * Sprint 12.1 — Structured logging for the communication layer.
 */

const LOG_COMPONENTS = Object.freeze({
  MESSENGER: "MESSENGER",
  GATEWAY: "GATEWAY",
  ROUTER: "ROUTER",
  AI: "AI",
  EVENT_BUS: "EVENT_BUS"
});

/**
 * @param {string} component
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
function logCommunication(component, message, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    component,
    message,
    ...details
  };

  if (details.level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  console.log(JSON.stringify(entry));
}

module.exports = {
  LOG_COMPONENTS,
  logCommunication
};
