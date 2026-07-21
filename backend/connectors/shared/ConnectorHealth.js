/**
 * Journey #7 — Standardized connector health statuses.
 */

const HEALTH_STATUS = Object.freeze({
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  DEGRADED: "degraded",
  AUTHENTICATION_ERROR: "authentication_error",
  RATE_LIMITED: "rate_limited",
  UNAVAILABLE: "unavailable"
});

/**
 * @param {string} status
 * @param {Object} [details]
 * @returns {Object}
 */
function createHealthResult(status, details = {}) {
  return {
    status,
    connector: details.connector || null,
    detail: details.detail || null,
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  HEALTH_STATUS,
  createHealthResult
};
