/**
 * Journey #7 — Connector observability logging (no secrets or tokens).
 */

function sanitizeMeta(meta = {}) {
  const safe = { ...meta };
  const redactKeys = [
    "accessToken",
    "refreshToken",
    "token",
    "password",
    "authorization",
    "secret"
  ];

  for (const key of redactKeys) {
    if (key in safe) {
      safe[key] = "[REDACTED]";
    }
  }

  return safe;
}

/**
 * @param {Object} entry
 */
function logConnectorOperation(entry) {
  const payload = sanitizeMeta({
    ts: new Date().toISOString(),
    component: "CONNECTOR",
    correlationId: entry.correlationId || null,
    connector: entry.connector || null,
    operation: entry.operation || null,
    latencyMs: entry.latencyMs ?? null,
    retries: entry.retries ?? 0,
    status: entry.status || null,
    detail: entry.detail || null
  });

  console.log(JSON.stringify(payload));
}

module.exports = {
  logConnectorOperation,
  sanitizeMeta
};
