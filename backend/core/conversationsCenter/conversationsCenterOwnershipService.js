/**
 * Conversations Center ownership presentation + transitions.
 * Persists via workflowStateStore (BR-135 durable). Product HUMAN maps to OWNERSHIP.AGENT.
 * Soft archive/close are presentation-only (do not mutate appointments).
 *
 * Ownership and attention are separate dimensions (BR-135 clarification):
 * sticky TAKE OVER (manualAgentOwnership + humanTakenOverAt) remains HUMAN even when
 * needsHumanAttention / stall metadata is also true. Return-to-Atlas clears the seal.
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
const { logWhatsAppStage } = require("../whatsappStructuredLogger");

/**
 * Active manual TAKE OVER seal. Return-to-Atlas nulls humanTakenOverAt + manualAgentOwnership.
 * Stall-only escalations may set manualAgentOwnership without humanTakenOverAt — those stay
 * NEEDS_ATTENTION (not sticky HUMAN).
 */
function hasActiveStickyHumanHold(persisted = {}) {
  return (
    persisted.manualAgentOwnership === true &&
    Boolean(persisted.humanTakenOverAt)
  );
}

function resolveConversationOwnershipState(persisted = {}) {
  // Sticky TAKE OVER wins over stall/attention metadata.
  if (hasActiveStickyHumanHold(persisted)) {
    return CONVERSATION_OWNERSHIP_STATE.HUMAN;
  }

  if (persisted.needsHumanAttention) {
    return CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION;
  }

  // workflowOwnership=AGENT without a sticky seal is not Conversations HUMAN
  // (BR-080 leftover / stall-cleared without TAKE OVER → ATLAS presentation).
  return CONVERSATION_OWNERSHIP_STATE.ATLAS;
}

function scopeOptions(phone, options = {}) {
  return {
    organizationId: options.organizationId || null,
    prospectId: options.prospectId || null,
    backend: options.backend || undefined,
    prospect: options.prospect || null,
    ownerUserId: options.ownerUserId || options.prospect?.owner_user_id || null,
    assignedUserId: options.assignedUserId || null,
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
 * Also acknowledges the current BR-080 attention episode (canonical acknowledgeLead)
 * when a prospect row + acting user are supplied. Does not Return to Atlas.
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

  // Implements BR-080 + BR-135: TAKE OVER acknowledges the current attention episode.
  const attentionAck = await acknowledgeCurrentBr080EpisodeOnTakeOver(options);

  return {
    previous,
    next,
    ownershipState: resolveConversationOwnershipState(next),
    attentionAck
  };
}

/**
 * Soft-fail BR-080 ack so sticky HUMAN seal is never rolled back by attention writes.
 * @param {Object} options
 * @param {Object} [options.prospect]
 * @param {{ userId?: string, userEmail?: string }} [options.actor]
 * @param {Function} [options.acknowledgeLeadFn] — injectable for tests
 */
async function acknowledgeCurrentBr080EpisodeOnTakeOver(options = {}) {
  const prospect = options.prospect || null;
  if (!prospect?.phone) {
    return { attempted: false, reason: "PROSPECT_NOT_PROVIDED" };
  }

  const actor = {
    userId: options.actor?.userId || options.userId || null,
    userEmail: options.actor?.userEmail || options.userEmail || null
  };

  try {
    const acknowledgeLeadFn =
      options.acknowledgeLeadFn ||
      require("../newLeadAttentionEngine").acknowledgeLead;
    const result = await acknowledgeLeadFn(prospect, actor);
    return {
      attempted: true,
      alreadyAcknowledged: Boolean(result?.alreadyAcknowledged),
      acknowledgedAt: result?.prospect?.acknowledged_at || null,
      attentionStatus: result?.prospect?.attention_status || null
    };
  } catch (error) {
    logWhatsAppStage("takeover_br080_acknowledge_failed", {
      level: "warn",
      phone: prospect.phone,
      error: error.message
    });
    return {
      attempted: true,
      failed: true,
      reason: error.message || "ACKNOWLEDGE_FAILED"
    };
  }
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
      inboxArchivedAt: new Date().toISOString(),
      inboxWindowExpiredAt: options.windowExpired
        ? new Date().toISOString()
        : previous.inboxWindowExpiredAt || null,
      inboxCloseReason: options.windowExpired
        ? INBOX_CLOSE_REASONS.WINDOW_EXPIRED
        : previous.inboxCloseReason || null
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
      inboxMarkedTestAt: null,
      inboxWindowExpiredAt: null
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
  hasActiveStickyHumanHold,
  resolveConversationOwnershipState,
  markConversationNeedsAttention,
  takeOverConversation,
  acknowledgeCurrentBr080EpisodeOnTakeOver,
  returnConversationToAtlas,
  archiveConversation,
  closeConversation,
  restoreConversation,
  markConversationAsTest
};
