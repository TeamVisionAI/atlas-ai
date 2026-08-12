/**
 * Sprint 8A.2 — BR-036 workflow ownership transitions.
 * Applies ownership changes from stall detection and prospect replies.
 * Persists via workflowStateStore; does not emit events (see workflowTransitionEvents).
 */

const { OWNERSHIP } = require("./workflowConstants");
const { savePersistedWorkflowState } = require("./workflowStateStore");

/**
 * Clears BR-034 escalation when prospect replies after stall.
 */
async function applyStallClearance(phone, persisted, computed, options = {}) {
  return savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: computed.workflowOwnership,
      needsHumanAttention: false,
      stalledAt: null,
      stallEpisodeKey: null,
      canonicalMilestone: computed.canonicalMilestone
    },
    options
  );
}

/**
 * Applies BR-034 stall transition: ownership → AGENT, needsHumanAttention → true.
 * Idempotent per stallEpisodeKey.
 *
 * @returns {Promise<{ applied: boolean, previous: Object, next: Object, transition: string|null }>}
 */
async function applyStallTransition(
  phone,
  persisted,
  stallResult,
  computed,
  options = {}
) {
  if (stallResult.cleared && persisted.needsHumanAttention) {
    const next = await applyStallClearance(phone, persisted, computed, options);
    return {
      applied: true,
      previous: persisted,
      next,
      transition: "stall_cleared_prospect_reply"
    };
  }

  if (!stallResult.isStalled) {
    return {
      applied: false,
      previous: persisted,
      next: persisted,
      transition: null
    };
  }

  if (
    persisted.needsHumanAttention &&
    persisted.stallEpisodeKey === stallResult.stallEpisodeKey
  ) {
    return {
      applied: false,
      previous: persisted,
      next: persisted,
      transition: null
    };
  }

  // BR-034 may record stall/attention metadata. Sticky TAKE OVER seals must not be cleared
  // or demoted — Conversations ownership stays HUMAN via humanTakenOverAt + manualAgentOwnership.
  const stickyTakeOver =
    persisted.manualAgentOwnership === true && Boolean(persisted.humanTakenOverAt);

  const next = await savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: true,
      stalledAt: stallResult.stallDetectedAt,
      stallEpisodeKey: stallResult.stallEpisodeKey,
      canonicalMilestone: computed.canonicalMilestone,
      manualAgentOwnership: true,
      // Preserve TAKE OVER seal; do not invent a return.
      ...(stickyTakeOver
        ? {
            humanTakenOverAt: persisted.humanTakenOverAt,
            handoffReason: persisted.handoffReason || "stall",
            handoffAt:
              persisted.handoffAt ||
              stallResult.stallDetectedAt ||
              new Date().toISOString()
          }
        : {
            handoffReason: "stall",
            handoffAt: stallResult.stallDetectedAt || new Date().toISOString()
          })
    },
    options
  );

  return {
    applied: true,
    previous: persisted,
    next,
    transition: "br_034_stall"
  };
}

module.exports = {
  applyStallTransition,
  applyStallClearance
};
