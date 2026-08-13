/**
 * Sprint 8A.2 — BR-036 workflow ownership transitions.
 * Applies ownership changes from stall detection and prospect replies.
 * Persists via workflowStateStore; does not emit events (see workflowTransitionEvents).
 *
 * BR-080 attention is not a BR-034 stall. Clearance requires a durable stall episode.
 */

const { OWNERSHIP } = require("./workflowConstants");
const { deriveDefaultOwnership } = require("./milestoneMapper");
const { savePersistedWorkflowState } = require("./workflowStateStore");
const { hasActiveStickyHumanHold } = require("./conversationsCenter/conversationsCenterOwnershipService");

/**
 * Canonical BR-034 stall evidence. BR-080 needsHumanAttention alone is not a stall.
 */
function hasDurableStallEpisode(persisted = {}) {
  return Boolean(persisted?.stalledAt || persisted?.stallEpisodeKey);
}

/**
 * Clears BR-034 escalation when prospect replies after a real stall episode.
 * Does not acknowledge BR-080. Preserves sticky TAKE OVER.
 */
async function applyStallClearance(phone, persisted, computed, options = {}) {
  const stickyTakeOver = hasActiveStickyHumanHold(persisted);
  const milestone = computed.canonicalMilestone || persisted.canonicalMilestone;
  const ownershipAfter = stickyTakeOver
    ? OWNERSHIP.AGENT
    : deriveDefaultOwnership(milestone, {
        ...(options.agentState || {}),
        manualAgentOwnership: false
      });

  return savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: ownershipAfter,
      needsHumanAttention: false,
      stalledAt: null,
      stallEpisodeKey: null,
      canonicalMilestone: milestone,
      ...(stickyTakeOver
        ? {}
        : {
            manualAgentOwnership: false,
            handoffReason: null,
            handoffAt: null
          })
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
  // BR-080 human_required / needsHumanAttention is not a stall episode.
  if (stallResult.cleared && hasDurableStallEpisode(persisted)) {
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
  hasDurableStallEpisode,
  applyStallTransition,
  applyStallClearance
};
