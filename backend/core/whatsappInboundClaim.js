/**
 * WhatsApp inbound atomic claim (provider message idempotency).
 * Canonical key: whatsapp:inbound:{providerMessageId}
 * Unique in DB via partial index idx_workflow_events_whatsapp_inbound_claim.
 */

const { WHATSAPP_CORRELATION_PREFIX } = require("./whatsappConstants");
const { EVENT_TYPES } = require("./workflowConstants");

const INBOUND_CLAIM_CORRELATION_RE = /^whatsapp:inbound:[^:]+$/;

function isWhatsAppInboundClaimCorrelationId(correlationId) {
  return INBOUND_CLAIM_CORRELATION_RE.test(String(correlationId || ""));
}

function buildInboundCorrelationId(providerMessageId) {
  return `${WHATSAPP_CORRELATION_PREFIX.INBOUND}${String(providerMessageId || "").trim()}`;
}

function isUniqueViolation(error) {
  if (!error) {
    return false;
  }
  const code = String(error.code || "");
  const message = String(error.message || error.details || "").toLowerCase();
  return (
    code === "23505" ||
    code === "409" ||
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("idx_workflow_events_whatsapp_inbound_claim")
  );
}

/**
 * In-memory claim store — synchronous Map set so overlapping Promise.all
 * calls have exactly one winner (models Postgres unique insert).
 */
function createMemoryWhatsAppInboundClaimStore() {
  const rows = new Map();

  return {
    async claim(input = {}) {
      const correlationId = String(input.correlationId || "").trim();
      if (!correlationId) {
        return { claimed: false, reason: "INVALID_CLAIM" };
      }
      if (rows.has(correlationId)) {
        return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      const event = {
        correlation_id: correlationId,
        prospect_phone: input.prospectPhone || null,
        organization_id: input.organizationId || null,
        payload: {
          providerMessageId: input.providerMessageId || null,
          inboundClaim: true
        },
        event_type: EVENT_TYPES.MESSAGE_RECEIVED,
        claimedAt: new Date().toISOString()
      };
      rows.set(correlationId, event);
      return { claimed: true, event };
    },
    has(correlationId) {
      return rows.has(String(correlationId || ""));
    },
    size() {
      return rows.size;
    }
  };
}

module.exports = {
  INBOUND_CLAIM_CORRELATION_RE,
  isWhatsAppInboundClaimCorrelationId,
  buildInboundCorrelationId,
  isUniqueViolation,
  createMemoryWhatsAppInboundClaimStore
};
