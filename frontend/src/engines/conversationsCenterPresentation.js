/**
 * Conversations Center pilot presentation helpers (UI/read-model only).
 */

export function buildConversationHeaderModel({
  name = null,
  phone = null,
  source = null,
  ownershipState = null,
  appointmentStatus = null,
  conversationGoal = null
} = {}) {
  const normalizedPhone = phone ? String(phone).trim() : null;
  return {
    name: name || null,
    phone: normalizedPhone,
    phoneCopyable: Boolean(normalizedPhone),
    source: source || null,
    ownershipState: ownershipState || null,
    appointmentStatus: appointmentStatus || null,
    conversationGoal: conversationGoal || null
  };
}

export function isHumanComposerEnabled(ownershipState) {
  return ownershipState === "HUMAN";
}

/** Sticky operator strip order: controls → status → composer → timeline. */
export function conversationsThreadRegionOrder() {
  return ["sticky_controls", "composer", "timeline"];
}
