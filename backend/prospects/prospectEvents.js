/**
 * Sprint 12.3 — Prospect domain events (emitted via shared EventBus).
 */

const ProspectEvent = Object.freeze({
  CREATED: "prospect.created",
  UPDATED: "prospect.updated",
  LINKED_CHANNEL: "prospect.linkedChannel"
});

module.exports = {
  ProspectEvent
};
