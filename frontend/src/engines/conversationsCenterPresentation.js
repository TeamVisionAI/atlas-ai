/**
 * Conversations Center pilot presentation helpers (UI/read-model only).
 *
 * Attention (NEEDS_ATTENTION) is not ownership. Button visibility must use
 * effectiveOwnership ∈ { HUMAN, ATLAS } only — never attention_status,
 * handoffReason, or stale manual flags.
 *
 * Inbox lifecycle (ACTIVE / SCHEDULED / CLOSED / TEST / ARCHIVED) is separate
 * from ownership and drives which threads appear in the working inbox.
 */

export function buildConversationHeaderModel({
  name = null,
  phone = null,
  source = null,
  ownershipState = null,
  appointmentStatus = null,
  conversationGoal = null,
  inboxLifecycle = null,
  inboxCloseReason = null
} = {}) {
  const normalizedPhone = phone ? String(phone).trim() : null;
  return {
    name: name || null,
    phone: normalizedPhone,
    phoneCopyable: Boolean(normalizedPhone),
    source: source || null,
    ownershipState: ownershipState || null,
    appointmentStatus: appointmentStatus || null,
    conversationGoal: conversationGoal || null,
    inboxLifecycle: inboxLifecycle || null,
    inboxCloseReason: inboxCloseReason || null
  };
}

/**
 * Normalize API ownership/attention presentation into authoritative ownership.
 * NEEDS_ATTENTION → ATLAS for control purposes (attention is separate).
 * Only explicit HUMAN remains HUMAN.
 */
export function resolveEffectiveOwnership(ownershipState) {
  if (ownershipState === "HUMAN") {
    return "HUMAN";
  }
  return "ATLAS";
}

export function isHumanComposerEnabled(effectiveOwnership) {
  return effectiveOwnership === "HUMAN";
}

/** TAKE OVER only when effective ownership is ATLAS. */
export function canTakeOverConversation(effectiveOwnership) {
  return effectiveOwnership === "ATLAS";
}

/** RETURN TO ATLAS only when effective ownership is HUMAN. */
export function canReturnConversationToAtlas(effectiveOwnership) {
  return effectiveOwnership === "HUMAN";
}

/**
 * Single source of truth for header action buttons.
 * @returns {("TAKE_OVER"|"RETURN_TO_ATLAS")[]}
 */
export function resolveThreadActionIds({
  ownershipState = null,
  effectiveOwnership = null
} = {}) {
  const effective =
    effectiveOwnership || resolveEffectiveOwnership(ownershipState);
  if (effective === "HUMAN") {
    return ["RETURN_TO_ATLAS"];
  }
  return ["TAKE_OVER"];
}

/**
 * Lifecycle actions for Active vs Archived/Test presentation.
 * Does not alter TAKE OVER / RETURN ownership contract.
 * @returns {("ARCHIVE"|"CLOSE"|"RESTORE"|"MARK_TEST")[]}
 */
export function resolveLifecycleActionIds({
  inboxLifecycle = null
} = {}) {
  const lifecycle = String(inboxLifecycle || "ACTIVE").toUpperCase();
  if (lifecycle === "ACTIVE") {
    return ["ARCHIVE", "CLOSE", "MARK_TEST"];
  }
  if (lifecycle === "ARCHIVED" || lifecycle === "TEST") {
    return ["RESTORE"];
  }
  // Derived SCHEDULED / CLOSED stay out of Active; viewable in Archived without soft restore.
  if (lifecycle === "CLOSED") {
    return ["RESTORE"];
  }
  return [];
}

/** Sticky operator strip order: controls → status → composer → timeline. */
export function conversationsThreadRegionOrder() {
  return ["sticky_controls", "composer", "timeline"];
}
