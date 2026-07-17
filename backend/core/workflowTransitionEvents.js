/**
 * Sprint 8A.2 — Emits workflow events for ownership transitions.
 * Invoked after workflowOwnershipEngine applies a new transition only.
 */

const { emit, EVENT_TYPES } = require("./eventEngine");
const { OWNERSHIP } = require("./workflowConstants");

/**
 * Emits BR-034 events for a new stall escalation.
 */
async function emitStallEscalationEvents({
  phone,
  milestone,
  ownershipBefore,
  stallResult
}) {
  const correlationId = `stall:${phone}:${stallResult.stallEpisodeKey}`;
  const base = {
    prospectPhone: phone,
    actor: "SYSTEM",
    milestoneBefore: milestone,
    milestoneAfter: milestone,
    ownershipBefore,
    ownershipAfter: OWNERSHIP.AGENT
  };

  const results = [];

  results.push(
    await emit(EVENT_TYPES.CONVERSATION_STALLED, {
      ...base,
      correlationId,
      payload: {
        lastAtlasOutboundAt: stallResult.lastAtlasOutboundAt,
        stallDetectedAt: stallResult.stallDetectedAt,
        recommendedAction: stallResult.recommendedAction,
        reason: "BR-034"
      }
    })
  );

  results.push(
    await emit(EVENT_TYPES.WORKFLOW_OWNERSHIP_CHANGED, {
      ...base,
      correlationId,
      payload: { reason: "BR-034", note: "Conversation stalled — 24h no prospect reply" }
    })
  );

  results.push(
    await emit(EVENT_TYPES.WORKFLOW_PAUSED, {
      ...base,
      correlationId,
      payload: { reason: "BR-034" }
    })
  );

  return results;
}

/**
 * Emits events when stall clears due to prospect reply.
 */
async function emitStallClearanceEvents({
  phone,
  milestone,
  ownershipBefore,
  ownershipAfter
}) {
  const correlationId = `stall-clear:${phone}:${Date.now()}`;

  return [
    await emit(EVENT_TYPES.WORKFLOW_OWNERSHIP_CHANGED, {
      prospectPhone: phone,
      actor: "SYSTEM",
      milestoneBefore: milestone,
      milestoneAfter: milestone,
      ownershipBefore,
      ownershipAfter,
      correlationId,
      payload: { reason: "prospect_reply", note: "Inbound after stall — ownership restored" }
    }),
    await emit(EVENT_TYPES.WORKFLOW_RESUMED, {
      prospectPhone: phone,
      actor: "SYSTEM",
      milestoneBefore: milestone,
      milestoneAfter: milestone,
      ownershipBefore,
      ownershipAfter,
      correlationId,
      payload: { trigger: "prospect_reply", resumeFromMilestone: milestone }
    })
  ];
}

module.exports = {
  emitStallEscalationEvents,
  emitStallClearanceEvents
};
