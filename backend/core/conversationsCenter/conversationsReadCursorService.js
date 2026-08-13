/**
 * Conversations mark-read cursor.
 * Writes only conversationsLastReadInboundAt / conversationsLastSeenInboundMessageId.
 * Does NOT acknowledge BR-080, mutate ownership, qualification, or appointments.
 */

"use strict";

const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("../workflowStateStore");

function laterIso(left, right) {
  const leftMs = Date.parse(left || "");
  const rightMs = Date.parse(right || "");
  if (Number.isNaN(leftMs)) {
    return right || null;
  }
  if (Number.isNaN(rightMs)) {
    return left || null;
  }
  return rightMs >= leftMs ? right : left;
}

async function markConversationRead({
  phone,
  organizationId = null,
  prospectId = null,
  lastReadInboundAt = null,
  lastSeenInboundMessageId = null,
  backend = undefined
} = {}) {
  if (!phone) {
    const error = new Error("phone is required");
    error.statusCode = 400;
    error.code = "CONVERSATION_MARK_READ_PHONE_REQUIRED";
    throw error;
  }

  const scope = {
    organizationId,
    prospectId,
    ...(backend ? { backend } : {})
  };
  const previous = await loadPersistedWorkflowState(phone, scope);
  const nextReadAt = laterIso(
    previous.conversationsLastReadInboundAt,
    lastReadInboundAt || new Date().toISOString()
  );

  const next = await savePersistedWorkflowState(
    phone,
    {
      conversationsLastReadInboundAt: nextReadAt,
      conversationsLastSeenInboundMessageId:
        lastSeenInboundMessageId ||
        previous.conversationsLastSeenInboundMessageId ||
        null
    },
    scope
  );

  return {
    phone,
    previous,
    next,
    lastReadInboundAt: next.conversationsLastReadInboundAt || nextReadAt,
    lastSeenInboundMessageId:
      next.conversationsLastSeenInboundMessageId ||
      lastSeenInboundMessageId ||
      null,
    ownershipUnchanged:
      previous.workflowOwnership === next.workflowOwnership &&
      Boolean(previous.manualAgentOwnership) === Boolean(next.manualAgentOwnership) &&
      Boolean(previous.needsHumanAttention) === Boolean(next.needsHumanAttention) &&
      (previous.humanTakenOverAt || null) === (next.humanTakenOverAt || null) &&
      (previous.stalledAt || null) === (next.stalledAt || null) &&
      (previous.stallEpisodeKey || null) === (next.stallEpisodeKey || null)
  };
}

module.exports = {
  markConversationRead,
  laterIso
};
