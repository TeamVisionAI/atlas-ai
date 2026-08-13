/**
 * Conversations Center pilot presentation helpers (UI/read-model only).
 *
 * Ownership and attention are separate dimensions (BR-135):
 * - ownershipState ∈ { HUMAN, ATLAS, NEEDS_ATTENTION } from API
 * - sticky HUMAN may also carry needsHumanAttention (stall warning) without demoting ownership
 * - Button visibility uses effectiveOwnership ∈ { HUMAN, ATLAS } only
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
  inboxCloseReason = null,
  needsHumanAttention = false
} = {}) {
  const normalizedPhone = phone ? String(phone).trim() : null;
  return {
    name: name || null,
    phone: normalizedPhone,
    phoneCopyable: Boolean(normalizedPhone),
    source: source || null,
    ownershipState: ownershipState || null,
    appointmentStatus: appointmentStatus || null,
    // Retained for diagnostics/API consumers; not shown in normal Conversations header.
    conversationGoal: conversationGoal || null,
    inboxLifecycle: inboxLifecycle || null,
    inboxCloseReason: inboxCloseReason || null,
    needsHumanAttention: Boolean(needsHumanAttention)
  };
}

/**
 * Internal workflow goals (e.g. DAY_PART) must not appear as user-facing header chips.
 */
export function isUserFacingConversationGoal(goal) {
  const value = String(goal || "").trim();
  if (!value) {
    return false;
  }
  const normalized = value.toUpperCase().replace(/\s+/g, "_");
  if (normalized === "DAY_PART" || normalized.includes("DAY_PART")) {
    return false;
  }
  return true;
}

/**
 * Handoff reason strings stay in storage/API; never render in the normal header.
 */
export function shouldShowHandoffReasonInHeader() {
  return false;
}

/**
 * Thread sticky header stacks identity above actions so long names never collide.
 * @returns {("identity"|"actions")[]}
 */
export function conversationsThreadHeaderRegionOrder() {
  return ["identity", "actions"];
}

/**
 * Normalize API ownership presentation into authoritative ownership for controls.
 * NEEDS_ATTENTION (Atlas-owned stall) → ATLAS for TAKE OVER.
 * Sticky HUMAN remains HUMAN even when a stall attention badge is also shown.
 */
export function resolveEffectiveOwnership(ownershipState) {
  if (ownershipState === "HUMAN") {
    return "HUMAN";
  }
  return "ATLAS";
}

/**
 * Stall/attention warning may coexist with HUMAN ownership (not mutually exclusive).
 */
export function shouldShowAttentionWarning({
  ownershipState = null,
  needsHumanAttention = false
} = {}) {
  if (ownershipState === "NEEDS_ATTENTION") {
    return true;
  }
  return ownershipState === "HUMAN" && Boolean(needsHumanAttention);
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

/** Sticky operator strip order: identity+actions → composer → timeline. */
export function conversationsThreadRegionOrder() {
  return ["sticky_controls", "composer", "timeline"];
}
