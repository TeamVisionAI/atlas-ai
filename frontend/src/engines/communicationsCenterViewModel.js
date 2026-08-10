/**
 * Communications Center presentation helpers (Prospect Workspace).
 */

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
