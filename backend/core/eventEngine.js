/**
 * Sprint 8A.1 — Event emission infrastructure.
 * Builds standard event envelopes and persists via workflowEventService.
 * Side-effect hooks (ownership changes, stall detection) arrive in Sprint 8A.2+.
 */

const crypto = require("crypto");
const { insertWorkflowEvent } = require("../services/workflowEventService");
const { EVENT_TYPES } = require("./workflowConstants");

/**
 * Standard event envelope (docs/EVENT_CATALOG.md).
 *
 * @param {string} eventType — EVENT_TYPES value
 * @param {Object} context
 * @param {string} context.prospectPhone
 * @param {string} [context.actor='SYSTEM']
 * @param {string} [context.milestoneBefore]
 * @param {string} [context.milestoneAfter]
 * @param {string} [context.ownershipBefore]
 * @param {string} [context.ownershipAfter]
 * @param {Object} [context.payload]
 * @param {string} [context.correlationId]
 */
async function emit(eventType, context = {}) {
  if (!context.prospectPhone) {
    return {
      success: false,
      error: "PROSPECT_PHONE_REQUIRED"
    };
  }

  if (!Object.values(EVENT_TYPES).includes(eventType)) {
    return {
      success: false,
      error: "UNKNOWN_EVENT_TYPE"
    };
  }

  const envelope = {
    eventId: crypto.randomUUID(),
    eventType,
    prospectPhone: context.prospectPhone,
    timestamp: new Date().toISOString(),
    actor: context.actor || "SYSTEM",
    milestoneBefore: context.milestoneBefore || null,
    milestoneAfter: context.milestoneAfter || null,
    ownershipBefore: context.ownershipBefore || null,
    ownershipAfter: context.ownershipAfter || null,
    payload: context.payload || {},
    correlationId: context.correlationId || null
  };

  const result = await insertWorkflowEvent(envelope);

  return {
    ...result,
    envelope
  };
}

module.exports = {
  emit,
  EVENT_TYPES
};
