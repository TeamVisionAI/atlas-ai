/**
 * Communications Center presentation helpers (Prospect Workspace).
 */

import {
  INTERNAL_MESSAGE_INTENTS,
  isAudioCommunicationItem,
  isMediaPlaceholderText,
  isOperationalCommunicationText
} from "./communicationClassification.js";

export function buildCommunicationsCacheKey(organizationId, prospectId) {
  return `communications:${organizationId || "org"}:${prospectId}`;
}

export const COMMUNICATIONS_FILTERS = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "workflow", label: "Workflow" },
  { id: "appointments", label: "Appointments" },
  { id: "system", label: "System / Errors" }
];

const FLAG_LABELS = {
  legacy_phone_correlation: "Matched using current phone (legacy)",
  historical_channel_identity_unavailable: "Prior phone history unavailable",
  ignored_counteroffer: "Counteroffer not handled",
  unhandled: "Request left unhandled",
  internal_error_leaked: "Internal diagnostic was exposed",
  dual_confirmation: "Duplicate confirmation",
  language_drift: "Language mismatch",
  spanish_confirmation: "Spanish confirmation",
  english_office_confirmation: "English office confirmation",
  no_reschedule_path: "No reschedule path offered",
  post_confirmation_lock: "Conversation locked after confirmation",
  repeated_slot_menu: "Repeated unavailable slot menu",
  counteroffer: "Scheduling counteroffer",
  delivery_attention: "Delivery needs attention",
  br075_decision: "Outbound authorization decision",
  agent_note: "Agent note"
};

export function labelForFlag(flag) {
  return FLAG_LABELS[flag] || flag;
}

export function filterCommunicationsItems(items = [], filterId = "all") {
  if (!filterId || filterId === "all") {
    return items;
  }

  return items.filter((item) => {
    const category = String(item.category || "");
    const flags = item.flags || [];

    switch (filterId) {
      case "messages":
        return category === "message" || category === "note";
      case "workflow":
        return category === "workflow";
      case "appointments":
        return category === "appointment";
      case "system":
        return (
          category === "delivery" ||
          category === "business_event" ||
          category === "timeline" ||
          flags.includes("internal_error_leaked") ||
          flags.includes("delivery_attention") ||
          flags.includes("ignored_counteroffer")
        );
      default:
        return true;
    }
  });
}

export function buildWarningBadges(item) {
  const flags = item?.flags || [];
  return flags
    .filter((flag) =>
      [
        "legacy_phone_correlation",
        "ignored_counteroffer",
        "internal_error_leaked",
        "dual_confirmation",
        "no_reschedule_path",
        "post_confirmation_lock",
        "language_drift"
      ].includes(flag)
    )
    .map((flag) => ({
      id: flag,
      label: labelForFlag(flag)
    }));
}

export function actorLabel(item) {
  const type = item?.actor?.type;
  if (type === "prospect") return "Prospect";
  if (type === "agent") return "Human agent";
  if (type === "atlas") return "Atlas AI";
  return item?.actor?.displayName || "System";
}

export function directionLabel(item) {
  const direction = item?.direction;
  if (direction === "inbound") return "Inbound";
  if (direction === "outbound") return "Outbound";
  return "System";
}

export function correlationLabel(item) {
  const tier = item?.metadata?.correlationTier;
  if (tier === "explicit_prospect_id") return "Explicit prospect link";
  if (tier === "authorized_current_phone_fallback") return "Legacy phone correlation";
  if (tier === "appointment_linked_to_prospect") return "Appointment link";
  return tier || "Unknown correlation";
}

export function containsRawPhoneLeak(text) {
  const value = String(text || "");
  return /\+\d{10,15}\b/.test(value) || /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.test(value);
}

/**
 * Conversations transcript (WhatsApp-like): only real Prospect / Atlas / Human
 * WhatsApp communication. Internal notes, qualification-save logs, workflow
 * brackets, and system events stay in Diagnostics only.
 * Presentation-only — does not mutate stored communications.
 */
export function isConversationBubbleItem(item) {
  const category = String(item?.category || "");
  if (category !== "message") {
    return false;
  }

  const flags = item?.flags || [];
  if (flags.includes("agent_note")) {
    return false;
  }

  const channel = String(item?.channel || "").toLowerCase();
  if (channel === "note") {
    return false;
  }

  const direction = String(item?.direction || "").toLowerCase();
  if (direction !== "inbound" && direction !== "outbound") {
    return false;
  }

  if (channel && channel !== "whatsapp") {
    return false;
  }

  const text = String(item?.content?.text || item?.content?.body || "").trim();

  // Native human / composer replies mapped with human_reply — show even when legacy
  // conversation_logs rows still carry AGENT_ACTION.
  if (flags.includes("human_reply")) {
    if (isOperationalCommunicationText(text)) {
      return false;
    }
    return true;
  }

  const intent = String(item?.ai?.intent || "").toUpperCase();
  if (INTERNAL_MESSAGE_INTENTS.has(intent)) {
    return false;
  }
  if (isAudioCommunicationItem(item) || isMediaPlaceholderText(text)) {
    return true;
  }
  if (isOperationalCommunicationText(text)) {
    return false;
  }

  return true;
}

export function isTechnicalCommunicationsItem(item) {
  return !isConversationBubbleItem(item);
}

/**
 * inbound → left (prospect); outbound / agent / atlas → right.
 */
export function resolveConversationBubbleSide(item) {
  const direction = String(item?.direction || "").toLowerCase();
  if (direction === "inbound") {
    return "inbound";
  }
  if (direction === "outbound") {
    return "outbound";
  }
  if (item?.actor?.type === "prospect") {
    return "inbound";
  }
  return "outbound";
}

export const CONVERSATION_LAYOUT_FILTERS = [
  { id: "messages", label: "Messages" },
  { id: "appointments", label: "Appointments" },
  { id: "all", label: "All messages" }
];

/**
 * Conversation layout list: default/messages show WhatsApp bubbles only.
 * Appointments filter shows appointment rows; "all" remains communication-only
 * (technical categories stay in the Diagnostics panel).
 */
export function filterConversationLayoutItems(items = [], filterId = "messages") {
  const list = Array.isArray(items) ? items : [];
  if (filterId === "appointments") {
    return list.filter((item) => String(item?.category || "") === "appointment");
  }
  // "all" and "messages" — communication bubbles only (no system/workflow/notes).
  return list.filter((item) => isConversationBubbleItem(item));
}

/** Conversations detail: real WhatsApp bubbles only, oldest → newest. */
export function selectConversationLayoutBubbles(items = []) {
  return orderCommunicationsForDisplay(
    (Array.isArray(items) ? items : []).filter((item) => isConversationBubbleItem(item)),
    { newestFirst: false }
  );
}

/**
 * Presentation-only timeline order. Does not mutate persisted communications data.
 * Default (newestFirst=false) keeps ascending chronological order for Prospect Workspace.
 * Conversations Center pilot passes newestFirst=true so operators see the latest first.
 */
export function orderCommunicationsForDisplay(items = [], { newestFirst = false } = {}) {
  const sorted = [...items].sort((a, b) => {
    const aMs = Date.parse(a?.timestampUtc || "") || 0;
    const bMs = Date.parse(b?.timestampUtc || "") || 0;
    if (aMs !== bMs) {
      return aMs - bMs;
    }
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });

  if (!newestFirst) {
    return sorted;
  }

  return sorted.reverse();
}
