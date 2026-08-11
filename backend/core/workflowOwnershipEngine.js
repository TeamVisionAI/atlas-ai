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

  const next = await savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: true,
      stalledAt: stallResult.stallDetectedAt,
      stallEpisodeKey: stallResult.stallEpisodeKey,
      canonicalMilestone: computed.canonicalMilestone,
      manualAgentOwnership: true,
      handoffReason: "stall",
      handoffAt: stallResult.stallDetectedAt || new Date().toISOString()
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
