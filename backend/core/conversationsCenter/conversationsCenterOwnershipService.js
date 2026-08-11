/**
 * Conversations Center ownership presentation + transitions.
 * Persists via workflowStateStore (BR-135 durable). Product HUMAN maps to OWNERSHIP.AGENT.
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

function scopeOptions(phone, options = {}) {
  return {
    organizationId: options.organizationId || null,
    prospectId: options.prospectId || null,
    backend: options.backend || undefined,
    findProspectFn: options.findProspectFn || null,
    findProspectInOrganizationFn: options.findProspectInOrganizationFn || null,
    findProspectByIdFn: options.findProspectByIdFn || null,
    supabaseClient: options.supabaseClient || null
  };
}

/**
 * Atlas/system path — mark NEEDS_ATTENTION with persisted reason.
 * Does not mutate appointments or qualification.
 */
async function markConversationNeedsAttention(
  phone,
  reason = HANDOFF_REASONS.UNKNOWN,
  patch = {},
  options = {}
) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const handoffReason =
    String(reason || HANDOFF_REASONS.UNKNOWN).trim() || HANDOFF_REASONS.UNKNOWN;
  const next = await savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: true,
      manualAgentOwnership: true,
      handoffReason,
      handoffAt: new Date().toISOString(),
      ...patch
    },
    scope
  );

  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

/**
 * TAKE OVER — human owns the thread; Atlas must not auto-reply.
 */
async function takeOverConversation(phone, options = {}) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const reason =
    options.reason || previous.handoffReason || HANDOFF_REASONS.TAKE_OVER;

  const next = await savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: false,
      manualAgentOwnership: true,
      stalledAt: null,
      stallEpisodeKey: null,
      handoffReason: reason,
      handoffAt: previous.handoffAt || new Date().toISOString(),
      humanTakenOverAt: new Date().toISOString()
    },
    scope
  );

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
async function returnConversationToAtlas(phone, options = {}) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const next = await savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false,
      manualAgentOwnership: false,
      stalledAt: null,
      stallEpisodeKey: null,
      handoffReason: null,
      handoffAt: null,
      humanTakenOverAt: null,
      returnedToAtlasAt: new Date().toISOString()
    },
    scope
  );

  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

async function archiveConversation(phone, options = {}) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const next = await savePersistedWorkflowState(
    phone,
    {
      inboxArchivedAt: new Date().toISOString()
    },
    scope
  );
  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

async function closeConversation(
  phone,
  reason = INBOX_CLOSE_REASONS.OTHER,
  options = {}
) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const closeReason = normalizeCloseReason(reason);
  const now = new Date().toISOString();
  const next = await savePersistedWorkflowState(
    phone,
    {
      inboxClosedAt: now,
      inboxCloseReason: closeReason,
      inboxArchivedAt: previous.inboxArchivedAt || now,
      needsHumanAttention: false
    },
    scope
  );
  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next),
    closeReason
  };
}

async function restoreConversation(phone, options = {}) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const next = await savePersistedWorkflowState(
    phone,
    {
      inboxArchivedAt: null,
      inboxClosedAt: null,
      inboxCloseReason: null,
      inboxMarkedTestAt: null
    },
    scope
  );
  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next)
  };
}

async function markConversationAsTest(phone, options = {}) {
  const scope = scopeOptions(phone, options);
  const previous = await loadPersistedWorkflowState(phone, scope);
  const next = await savePersistedWorkflowState(
    phone,
    {
      inboxMarkedTestAt: previous.inboxMarkedTestAt || new Date().toISOString(),
      needsHumanAttention: false
    },
    scope
  );
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
  returnConversationToAtlas,
  archiveConversation,
  closeConversation,
  restoreConversation,
  markConversationAsTest
};
