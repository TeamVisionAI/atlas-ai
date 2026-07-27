/**
 * Sprint 22.1 — Structured appointment history entries.
 */

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
  summarizeHistory
};
