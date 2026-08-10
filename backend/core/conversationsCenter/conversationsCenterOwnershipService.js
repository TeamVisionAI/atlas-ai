/**
 * Conversations Center ownership presentation + transitions.
 * Persists via workflowStateStore. Product HUMAN maps to OWNERSHIP.AGENT.
 * Soft archive/close are presentation-only (do not mutate appointments).
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
const {
  normalizeCloseReason,
  INBOX_CLOSE_REASONS
} = require("./conversationsCenterLifecycle");

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

/**
 * Soft-remove from Active inbox. Does not change ownership silence or appointments.
 */
function archiveConversation(phone) {
  const previous = loadPersistedWorkflowState(phone);
  const next = savePersistedWorkflowState(phone, {
    inboxArchivedAt: new Date().toISOString()
  });
  return { previous, next, ownershipState: resolveConversationOwnershipState(next) };
}

/**
 * Explicit close without inventing appointment outcomes.
 * Presentation fields only — does not overwrite milestone SCHEDULED/COMPLETED truth.
 */
function closeConversation(phone, reason = INBOX_CLOSE_REASONS.OTHER) {
  const previous = loadPersistedWorkflowState(phone);
  const closeReason = normalizeCloseReason(reason);
  const now = new Date().toISOString();
  const next = savePersistedWorkflowState(phone, {
    inboxClosedAt: now,
    inboxCloseReason: closeReason,
    inboxArchivedAt: previous.inboxArchivedAt || now,
    needsHumanAttention: false
  });
  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next),
    closeReason
  };
}

/**
 * Restore manual archive / soft-close presentation flags.
 * Does not reopen CLOSED milestones or mutate appointments.
 */
function restoreConversation(phone) {
  const previous = loadPersistedWorkflowState(phone);
  const next = savePersistedWorkflowState(phone, {
    inboxArchivedAt: null,
    inboxClosedAt: null,
    inboxCloseReason: null,
    inboxMarkedTestAt: null
  });
  return { previous, next, ownershipState: resolveConversationOwnershipState(next) };
}

/**
 * Mark as TEST/CANARY for inbox exclusion (audit/search remains).
 */
function markConversationAsTest(phone) {
  const previous = loadPersistedWorkflowState(phone);
  const next = savePersistedWorkflowState(phone, {
    inboxMarkedTestAt: previous.inboxMarkedTestAt || new Date().toISOString(),
    needsHumanAttention: false
  });
  return { previous, next, ownershipState: resolveConversationOwnershipState(next) };
}

module.exports = {
  resolveConversationOwnershipState,
  markConversationNeedsAttention,
  takeOverConversation,
  returnConversationToAtlas,
  archiveConversation,
  closeConversation,
  restoreConversation,
  markConversationAsTest
};
