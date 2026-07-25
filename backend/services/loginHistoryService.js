/**
 * LC1.1 — Login history persistence.
 */

const { insertBackendRow } = require("./backendDbService");

async function writeLoginHistory(entry = {}) {
  const payload = {
    user_id: entry.userId || null,
    user_email: entry.userEmail || null,
    event_type: entry.eventType,
    result: entry.result || "success",
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null,
    metadata: entry.metadata || {}
  };

  try {
    return await insertBackendRow("atlas_login_history", payload);
  } catch (error) {
    console.error("[login-history]", error.message, payload.event_type);
    return null;
  }
}

module.exports = {
  writeLoginHistory
};
