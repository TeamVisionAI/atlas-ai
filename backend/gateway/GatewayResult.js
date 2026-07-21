/**
 * Journey #6 — Standardized gateway operation result.
 */

const crypto = require("crypto");

/**
 * @param {Object} params
 * @returns {Object}
 */
function createGatewayResult(params = {}) {
  return {
    success: Boolean(params.success),
    correlationId: params.correlationId || crypto.randomUUID(),
    envelope: params.envelope || null,
    agentResult: params.agentResult || null,
    outbound: params.outbound || null,
    deliveryStatus: params.deliveryStatus || null,
    error: params.error || null
  };
}

module.exports = {
  createGatewayResult
};
