/**
 * Conversations Center ownership presentation + transitions.
 * Persists via workflowStateStore. Product HUMAN maps to OWNERSHIP.AGENT.
 */

const { OWNERSHIP } = require("../workflowConstants");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("../workflowStateStore");
const {
  CONVERSATION_OWNERSHIP_STATE,
  HANDOFF_REASONS
} = require("./constants");

function resolveConversationOwnershipState(persisted = {}) {
  if (persisted.needsHumanAttention) {
    return CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION;
  }

  if (
    persisted.workflowOwnership === OWNERSHIP.AGENT ||
    persisted.manualAgentOwnership === true
  ) {
    return CONVERSATION_OWNERSHIP_STATE.HUMAN;
  }

  return CONVERSATION_OWNERSHIP_STATE.ATLAS;
}

/**
 * Atlas/system path — mark NEEDS_ATTENTION with persisted reason.
 * Does not mutate appointments or qualification.
 */
function markConversationNeedsAttention(phone, reason = HANDOFF_REASONS.UNKNOWN, patch = {}) {
  const previous = loadPersistedWorkflowState(phone);
  const handoffReason = String(reason || HANDOFF_REASONS.UNKNOWN).trim() || HANDOFF_REASONS.UNKNOWN;
  const next = savePersistedWorkflowState(phone, {
    workflowOwnership: OWNERSHIP.AGENT,
    needsHumanAttention: true,
    manualAgentOwnership: true,
    handoffReason,
    handoffAt: new Date().toISOString(),
    ...patch
  });

  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

/**
 * TAKE OVER — human owns the thread; Atlas must not auto-reply.
 */
function takeOverConversation(phone, options = {}) {
  const previous = loadPersistedWorkflowState(phone);
  const reason =
    options.reason ||
    previous.handoffReason ||
    HANDOFF_REASONS.TAKE_OVER;

  const next = savePersistedWorkflowState(phone, {
    workflowOwnership: OWNERSHIP.AGENT,
    needsHumanAttention: false,
    manualAgentOwnership: true,
    stalledAt: null,
    stallEpisodeKey: null,
    handoffReason: reason,
    handoffAt: previous.handoffAt || new Date().toISOString(),
    humanTakenOverAt: new Date().toISOString()
  });

  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

/**
 * RETURN TO ATLAS — automation may resume on subsequent inbound.
 * Preserves conversation/prospect/appointment state; does not replay messages.
 */
function returnConversationToAtlas(phone) {
  const previous = loadPersistedWorkflowState(phone);
  const next = savePersistedWorkflowState(phone, {
    workflowOwnership: OWNERSHIP.ATLAS,
    needsHumanAttention: false,
    manualAgentOwnership: false,
    stalledAt: null,
    stallEpisodeKey: null,
    handoffReason: null,
    handoffAt: null,
    humanTakenOverAt: null,
    returnedToAtlasAt: new Date().toISOString()
  });

  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

module.exports = {
  resolveConversationOwnershipState,
  markConversationNeedsAttention,
  takeOverConversation,
  returnConversationToAtlas
};
