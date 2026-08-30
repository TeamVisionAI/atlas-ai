/**
 * Sprint 22.1 — Structured appointment history entries.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidActor(value) {
  return UUID_RE.test(String(value || "").trim());
}

function presentHistoryActorLabel(actor, nameById = new Map()) {
  const raw = String(actor || "").trim();
  if (!raw) {
    return null;
  }

  const lower = raw.toLowerCase();
  if (lower === "system" || lower === "atlas") {
    return "Atlas";
  }
  if (lower === "agent") {
    return "Agent";
  }

  if (isUuidActor(raw)) {
    return (
      nameById.get(raw) ||
      nameById.get(raw.toLowerCase()) ||
      "Former teammate"
    );
  }

  return raw;
}

function presentAppointmentHistory(history = [], nameById = new Map()) {
  return history.map((event) => ({
    ...event,
    actorName: presentHistoryActorLabel(event.actor, nameById)
  }));
}

function recordHistoryEvent(appointment, entry) {
  const event = {
    type: entry.type,
    at: entry.at || new Date().toISOString(),
    actor: entry.actor || "system",
    reason: entry.reason || null,
    summary: entry.summary || null,
    oldValues: entry.oldValues || null,
    newValues: entry.newValues || null
  };

  return [...(appointment.history || []), event];
}

function summarizeHistory(history = []) {
  return history.map((event) => ({
    ...event,
    label: event.type?.replace(/_/g, " ") || "event"
  }));
}

module.exports = {
  recordHistoryEvent,
  summarizeHistory,
  isUuidActor,
  presentHistoryActorLabel,
  presentAppointmentHistory
};
