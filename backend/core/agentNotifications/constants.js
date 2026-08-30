/**
 * BR-176 — Agent Notifications Foundation.
 * In-app V1. Channels stay separate from event routing.
 */

const EVENT_TYPES = Object.freeze({
  NEW_APPOINTMENT: "NEW_APPOINTMENT",
  APPOINTMENT_RESCHEDULED: "APPOINTMENT_RESCHEDULED",
  APPOINTMENT_CANCELLED: "APPOINTMENT_CANCELLED",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
  HUMAN_TAKEOVER_REQUESTED: "HUMAN_TAKEOVER_REQUESTED"
});

const SOUND_EVENT_TYPES = Object.freeze(Object.values(EVENT_TYPES));

const SEVERITIES = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH"
});

const ENTITY_TYPES = Object.freeze({
  APPOINTMENT: "appointment",
  PROSPECT: "prospect",
  CONVERSATION: "conversation"
});

const CHANNELS = Object.freeze({
  IN_APP: "in_app"
});

const DEFAULT_EVENT_TOGGLES = Object.freeze({
  [EVENT_TYPES.NEW_APPOINTMENT]: true,
  [EVENT_TYPES.APPOINTMENT_RESCHEDULED]: true,
  [EVENT_TYPES.APPOINTMENT_CANCELLED]: true,
  [EVENT_TYPES.NEEDS_ATTENTION]: true,
  [EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED]: true
});

const PREFERENCE_DEFAULTS = Object.freeze({
  inAppEnabled: true,
  soundEnabled: false,
  events: DEFAULT_EVENT_TOGGLES
});

const TAKEOVER_REQUEST_REASONS = Object.freeze([
  "explicit_human_request",
  "recruiter_escalation"
]);

const AUDIT_ACTIONS = Object.freeze({
  PREFERENCES_UPDATED: "agent_notifications.preferences_updated"
});

module.exports = {
  EVENT_TYPES,
  SOUND_EVENT_TYPES,
  SEVERITIES,
  ENTITY_TYPES,
  CHANNELS,
  DEFAULT_EVENT_TOGGLES,
  PREFERENCE_DEFAULTS,
  TAKEOVER_REQUEST_REASONS,
  AUDIT_ACTIONS
};
