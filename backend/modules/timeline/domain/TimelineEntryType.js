/**
 * Sprint 14.3 — Timeline entry display categories (PROSPECT_TIMELINE.md).
 */

const {
  LEAD_EVENTS,
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  RECRUITING_EVENTS,
  SALES_EVENTS,
  AI_EVENTS,
  SYSTEM_EVENTS
} = require("../../business-events/domain/EventTypes");

const TIMELINE_ENTRY_TYPES = Object.freeze({
  LEAD_ORIGIN: "lead_origin",
  ASSIGNMENT: "assignment",
  LIFECYCLE: "lifecycle",
  MESSAGING: "messaging",
  SCHEDULING: "scheduling",
  RECRUITING: "recruiting",
  SALES: "sales",
  AI: "ai",
  SYSTEM: "system"
});

const LEAD_EVENT_SET = new Set(Object.values(LEAD_EVENTS));
const COMMUNICATION_EVENT_SET = new Set(Object.values(COMMUNICATION_EVENTS));
const APPOINTMENT_EVENT_SET = new Set(Object.values(APPOINTMENT_EVENTS));
const RECRUITING_EVENT_SET = new Set(Object.values(RECRUITING_EVENTS));
const SALES_EVENT_SET = new Set(Object.values(SALES_EVENTS));
const AI_EVENT_SET = new Set(Object.values(AI_EVENTS));
const SYSTEM_EVENT_SET = new Set(Object.values(SYSTEM_EVENTS));

/**
 * Map a Business Event type to a timeline entry category.
 * @param {string} eventType
 * @returns {string}
 */
function mapBusinessEventToEntryType(eventType) {
  if (eventType === LEAD_EVENTS.PROSPECT_ASSIGNED) {
    return TIMELINE_ENTRY_TYPES.ASSIGNMENT;
  }

  if (
    eventType === LEAD_EVENTS.PROSPECT_UPDATED ||
    eventType === LEAD_EVENTS.PROSPECT_RESTORED
  ) {
    return TIMELINE_ENTRY_TYPES.LIFECYCLE;
  }

  if (LEAD_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.LEAD_ORIGIN;
  }

  if (COMMUNICATION_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.MESSAGING;
  }

  if (APPOINTMENT_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.SCHEDULING;
  }

  if (RECRUITING_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.RECRUITING;
  }

  if (SALES_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.SALES;
  }

  if (AI_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.AI;
  }

  if (SYSTEM_EVENT_SET.has(eventType)) {
    return TIMELINE_ENTRY_TYPES.SYSTEM;
  }

  return TIMELINE_ENTRY_TYPES.SYSTEM;
}

module.exports = {
  TIMELINE_ENTRY_TYPES,
  mapBusinessEventToEntryType
};
