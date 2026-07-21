/**
 * Journey #7 — Standardized connector operation results.
 */

const crypto = require("crypto");

/**
 * @param {Object} params
 * @returns {Object}
 */
function createConnectorResult(params = {}) {
  return {
    success: Boolean(params.success),
    correlationId: params.correlationId || crypto.randomUUID(),
    connector: params.connector || null,
    operation: params.operation || null,
    data: params.data ?? null,
    deliveryStatus: params.deliveryStatus || null,
    error: params.error || null,
    latencyMs: params.latencyMs ?? null,
    retries: params.retries ?? 0,
    simulated: Boolean(params.simulated)
  };
}

module.exports = {
  createConnectorResult
};
