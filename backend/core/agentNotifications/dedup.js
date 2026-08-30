/**
 * BR-176 — deterministic dedup keys so the same operational event is not spammed.
 */

const { EVENT_TYPES } = require("./constants");

function utcDayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildDedupKey(event = {}) {
  const org = String(event.organizationId || "unknown");
  const type = String(event.eventType || "unknown");
  const entityId = String(event.entityId || event.appointment?.id || "none");

  if (type === EVENT_TYPES.NEW_APPOINTMENT) {
    return `${type}:${org}:${entityId}`;
  }
  if (type === EVENT_TYPES.APPOINTMENT_RESCHEDULED) {
    const start = String(event.startDateTime || event.appointment?.startDateTime || "");
    return `${type}:${org}:${entityId}:${start}`;
  }
  if (type === EVENT_TYPES.APPOINTMENT_CANCELLED) {
    return `${type}:${org}:${entityId}`;
  }
  if (type === EVENT_TYPES.NEEDS_ATTENTION || type === EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED) {
    const episode =
      event.episodeKey ||
      event.workflow?.stallEpisodeKey ||
      `${entityId}:${utcDayKey(event.occurredAt || new Date())}`;
    return `${type}:${org}:${episode}`;
  }
  if (type === EVENT_TYPES.FOLLOW_UP_DUE || type === EVENT_TYPES.FOLLOW_UP_OVERDUE) {
    const episode = event.dueDate || event.episodeKey || utcDayKey(event.occurredAt || new Date());
    return `${type}:${org}:${entityId}:${episode}`;
  }
  return `${type}:${org}:${entityId}`;
}

module.exports = {
  utcDayKey,
  buildDedupKey
};
