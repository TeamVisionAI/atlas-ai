/**
 * Sprint 22 — Appointment Engine domain constants.
 * Implements BR-004 scheduling vocabulary.
 */

const APPOINTMENT_PURPOSES = Object.freeze({
  RECRUITING_INTERVIEW: "recruiting_interview",
  FNA: "fna",
  POLICY_REVIEW: "policy_review",
  CLIENT_SERVICE: "client_service",
  TRAINING: "training",
  OTHER: "other"
});

const MEETING_TYPES = Object.freeze({
  VIRTUAL: "virtual",
  IN_PERSON: "in_person",
  PHONE: "phone"
});

const VIRTUAL_PROVIDERS = Object.freeze({
  ZOOM: "zoom",
  WHATSAPP_VIDEO: "whatsapp_video",
  GOOGLE_MEET: "google_meet",
  PHONE_CALL: "phone_call",
  OTHER: "other"
});

const MEETING_LOCATION_TYPES = Object.freeze({
  VIRTUAL: "virtual",
  OFFICE: "office",
  PROSPECT_HOME: "prospect_home",
  PUBLIC_LOCATION: "public_location",
  OTHER: "other"
});

const APPOINTMENT_SOURCES = Object.freeze({
  ATLAS_AI: "atlas_ai",
  AGENT_MANUAL: "agent_manual",
  WEBSITE: "website",
  MISSION_CONTROL: "mission_control",
  QUICK_CAPTURE: "quick_capture",
  IMPORT: "import",
  OTHER: "other"
});

const APPOINTMENT_STATUSES = Object.freeze({
  DRAFT: "draft",
  PENDING_CONFIRMATION: "pending_confirmation",
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  RESCHEDULED: "rescheduled",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
  HUMAN_ASSIST_REQUIRED: "human_assist_required"
});

const APPOINTMENT_OUTCOMES = Object.freeze({
  RECRUITED: "recruited",
  CLIENT: "client",
  FOLLOW_UP: "follow_up",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
  NOT_INTERESTED: "not_interested",
  RESCHEDULED: "rescheduled",
  COMPLETED: "completed",
  OTHER: "other"
});

const RESCHEDULE_REASONS = Object.freeze({
  PROSPECT_REQUESTED: "prospect_requested",
  AGENT_REQUESTED: "agent_requested",
  TECHNICAL_ISSUE: "technical_issue",
  NO_SHOW: "no_show",
  EMERGENCY: "emergency",
  OTHER: "other"
});

const EMAIL_STATUSES = Object.freeze({
  VERIFIED: "verified",
  UNVERIFIED: "unverified",
  INVALID: "invalid",
  MISSING: "missing"
});

const CONFIRMATION_STATUSES = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  MISSING_EMAIL: "missing_email"
});

const REMINDER_STATUSES = Object.freeze({
  PENDING: "pending",
  SCHEDULED: "scheduled",
  SENT: "sent",
  CANCELLED: "cancelled",
  FAILED: "failed"
});

const DAY_OF_WEEK = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

const COMMON_SCHEDULE_PRESETS = Object.freeze({
  WEEKDAYS: [1, 2, 3, 4, 5],
  WEEKENDS: [0, 6],
  EVERY_DAY: [0, 1, 2, 3, 4, 5, 6]
});

const MORNING_RANGE = Object.freeze({ start: "08:00", end: "12:00" });
const AFTERNOON_RANGE = Object.freeze({ start: "12:01", end: "18:00" });

const SLOT_INTERVAL_MINUTES = 30;

/** Full working-day half-hour coverage (9 AM–9 PM = 24 starts; 48 covers 24h). */
const FULL_DAY_MAX_SLOT_RESULTS = 48;

function isValidPurpose(value) {
  return Object.values(APPOINTMENT_PURPOSES).includes(value);
}

function isValidStatus(value) {
  return Object.values(APPOINTMENT_STATUSES).includes(value);
}

function isValidOutcome(value) {
  return Object.values(APPOINTMENT_OUTCOMES).includes(value);
}

function isValidMeetingType(value) {
  return Object.values(MEETING_TYPES).includes(value);
}

function isValidVirtualProvider(value) {
  return Object.values(VIRTUAL_PROVIDERS).includes(value);
}

function isValidLocationType(value) {
  return Object.values(MEETING_LOCATION_TYPES).includes(value);
}

function isValidSource(value) {
  return Object.values(APPOINTMENT_SOURCES).includes(value);
}

function isValidRescheduleReason(value) {
  return Object.values(RESCHEDULE_REASONS).includes(value);
}

function isTerminalStatus(status) {
  return [
    APPOINTMENT_STATUSES.COMPLETED,
    APPOINTMENT_STATUSES.CANCELLED,
    APPOINTMENT_STATUSES.NO_SHOW
  ].includes(status);
}

function isActiveStatus(status) {
  return !isTerminalStatus(status) && status !== APPOINTMENT_STATUSES.DRAFT;
}

module.exports = {
  APPOINTMENT_PURPOSES,
  MEETING_TYPES,
  VIRTUAL_PROVIDERS,
  MEETING_LOCATION_TYPES,
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_OUTCOMES,
  RESCHEDULE_REASONS,
  EMAIL_STATUSES,
  CONFIRMATION_STATUSES,
  REMINDER_STATUSES,
  DAY_OF_WEEK,
  COMMON_SCHEDULE_PRESETS,
  MORNING_RANGE,
  AFTERNOON_RANGE,
  SLOT_INTERVAL_MINUTES,
  FULL_DAY_MAX_SLOT_RESULTS,
  isValidPurpose,
  isValidStatus,
  isValidOutcome,
  isValidMeetingType,
  isValidVirtualProvider,
  isValidLocationType,
  isValidSource,
  isValidRescheduleReason,
  isTerminalStatus,
  isActiveStatus
};
