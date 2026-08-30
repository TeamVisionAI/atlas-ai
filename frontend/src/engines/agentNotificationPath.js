/**
 * BR-176 — resolve click-through from a notification row.
 * Uses stored entity ids with existing appointments/conversations query conventions.
 * Does not invent a new appointment-detail route.
 */

const APPOINTMENTS_PATH = "/app/appointments";
const CONVERSATIONS_PATH = "/app/conversations";
const NOTIFICATIONS_PATH = "/app/notifications";

const APPOINTMENT_EVENTS = new Set([
  "NEW_APPOINTMENT",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_CANCELLED"
]);

const CONVERSATION_EVENTS = new Set(["NEEDS_ATTENTION", "HUMAN_TAKEOVER_REQUESTED"]);

function entityIdOf(item = {}) {
  return String(item.entityId || item.entity_id || "").trim();
}

function eventTypeOf(item = {}) {
  return String(item.eventType || item.event_type || "").trim();
}

function entityTypeOf(item = {}) {
  return String(item.entityType || item.entity_type || "")
    .trim()
    .toLowerCase();
}

export function resolveAgentNotificationPath(item = {}) {
  const entityId = entityIdOf(item);
  const eventType = eventTypeOf(item);
  const entityType = entityTypeOf(item);

  if (entityId && (APPOINTMENT_EVENTS.has(eventType) || entityType === "appointment")) {
    return `${APPOINTMENTS_PATH}?appointmentId=${encodeURIComponent(entityId)}`;
  }

  if (
    entityId &&
    (CONVERSATION_EVENTS.has(eventType) ||
      entityType === "prospect" ||
      entityType === "conversation")
  ) {
    return `${CONVERSATIONS_PATH}?prospectId=${encodeURIComponent(entityId)}`;
  }

  return item.actionUrl || item.action_url || NOTIFICATIONS_PATH;
}

export function resolveConversationListRow({ items = [], prospectId = "", phone = "" } = {}) {
  const wantedPhone = String(phone || "").trim();
  const wantedProspectId = String(prospectId || "").trim();
  const rows = Array.isArray(items) ? items : [];

  if (wantedPhone) {
    const byPhone = rows.find((row) => String(row?.phone || "") === wantedPhone);
    if (byPhone) {
      return byPhone;
    }
  }

  if (wantedProspectId) {
    return (
      rows.find(
        (row) =>
          String(row?.id || "") === wantedProspectId ||
          String(row?.prospectId || "") === wantedProspectId
      ) || null
    );
  }

  return null;
}
