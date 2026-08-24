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
  displayIdentity = null,
  hasVisiblePhone = null,
  source = null,
  ownershipState = null,
  appointmentStatus = null,
  canonicalMilestone = null,
  currentStep = null,
  conversationGoal = null,
  inboxLifecycle = null,
  inboxCloseReason = null,
  needsHumanAttention = false
} = {}) {
  const normalizedPhone = phone ? String(phone).trim() : null;
  const synthetic =
    normalizedPhone != null && String(normalizedPhone).startsWith("wa:bsuid:");
  const visiblePhone =
    hasVisiblePhone === false || synthetic ? null : normalizedPhone;
  return {
    name: name || null,
    displayIdentity:
      displayIdentity ||
      name ||
      (visiblePhone ? visiblePhone : null) ||
      null,
    phone: visiblePhone,
    phoneLabel: visiblePhone || "Phone unavailable",
    phoneCopyable: Boolean(visiblePhone),
    source: source || null,
    ownershipState: ownershipState || null,
    appointmentStatus: appointmentStatus || null,
    canonicalMilestone: canonicalMilestone || null,
    currentStep: currentStep || null,
    statusBadge: resolveConversationsStatusBadge(
      appointmentStatus,
      canonicalMilestone,
      currentStep
    ),
    // Retained for diagnostics/API consumers; not shown in normal Conversations header.
    conversationGoal: conversationGoal || null,
    inboxLifecycle: inboxLifecycle || null,
    inboxCloseReason: inboxCloseReason || null,
    needsHumanAttention: Boolean(needsHumanAttention)
  };
}

/**
 * Qualification-brain / engine field tokens. Never render in Conversations RVP UI.
 * Not Ruth-specific — any current_step / appointmentStatus / goal using these is internal.
 */
export const INTERNAL_QUALIFICATION_TOKENS = Object.freeze([
  "DAY_PART",
  "CITY",
  "STATE",
  "NAME",
  "EMAIL",
  "OCCUPATION",
  "AUTHORIZATION",
  "WORK_AUTHORIZATION",
  "INTERVIEW_TYPE",
  "SCHEDULE",
  "PREFERRED_TIME",
  "LANGUAGE",
  "PREFERRED_LANGUAGE"
]);

/**
 * Allowlisted Conversations status-badge tokens → compact RVP label.
 * Fail closed: unknown enums do not render.
 */
export const CONVERSATION_STATUS_BADGE_LABELS = Object.freeze({
  NEW: "NEW",
  NEW_LEAD: "NEW",
  GREETING: "GREETING",
  GREETING_SENT: "GREETING",
  QUALIFICATION: "QUALIFICATION",
  QUALIFYING: "QUALIFICATION",
  INTERVIEW_READY: "INTERVIEW_READY",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  SCHEDULED: "SCHEDULED",
  CONFIRMED: "CONFIRMED",
  INTERVIEW_DUE: "INTERVIEW_DUE",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED",
  COMPLETED: "COMPLETED",
  INTERVIEW_RESULT_PENDING: "INTERVIEW_RESULT_PENDING",
  FOLLOW_UP: "FOLLOW_UP",
  ORIENTATION: "ORIENTATION",
  LICENSING: "LICENSING",
  FAST_START: "FAST_START",
  CLOSED: "CLOSED",
  DO_NOT_CONTACT: "DO_NOT_CONTACT",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
  RESCHEDULED: "RESCHEDULED",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  IN_PROGRESS: "IN_PROGRESS"
});

export function normalizeConversationToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function isInternalQualificationToken(value) {
  const token = normalizeConversationToken(value);
  if (!token) {
    return false;
  }
  if (token.includes("DAY_PART")) {
    return true;
  }
  return INTERNAL_QUALIFICATION_TOKENS.includes(token);
}

/**
 * Third Conversations header badge: user-facing lifecycle/status only.
 * Tries appointment status, then canonical milestone, then current_step.
 * Raw qualification tokens (DAY_PART, CITY, …) never win.
 */
export function resolveConversationsStatusBadge(...candidates) {
  for (const candidate of candidates) {
    const token = normalizeConversationToken(candidate);
    if (!token || token === "NONE" || token === "NULL" || token === "UNDEFINED") {
      continue;
    }
    if (isInternalQualificationToken(token)) {
      continue;
    }
    const label = CONVERSATION_STATUS_BADGE_LABELS[token];
    if (label) {
      return label;
    }
  }
  return null;
}

/**
 * Campaign / conversation goals may be freeform, but internal field tokens must not chip.
 */
export function isUserFacingConversationGoal(goal) {
  const value = String(goal || "").trim();
  if (!value) {
    return false;
  }
  if (isInternalQualificationToken(value)) {
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

/** Thread pane order: sticky header → scrollable transcript → sticky bottom composer. */
export function conversationsThreadRegionOrder() {
  return ["sticky_controls", "timeline", "composer"];
}

/**
 * Messaging unread presentation. Separate from NEEDS_ATTENTION / BR-080.
 */
export function resolveConversationUnreadPresentation({
  unread = false,
  unreadCount = 0
} = {}) {
  const count = Math.max(0, Number(unreadCount) || 0);
  const isUnread = Boolean(unread) || count > 0;
  return {
    unread: isUnread,
    unreadCount: count,
    showDot: isUnread,
    showCount: count > 1,
    displayCount: count > 1 ? count : count === 1 ? 1 : null,
    boldName: isUnread,
    boldPreview: isUnread
  };
}

/** Unread ≠ attention. Both may coexist. */
export function unreadIsNeedsAttention() {
  return false;
}
