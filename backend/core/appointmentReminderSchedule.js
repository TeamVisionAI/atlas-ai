/**
 * Shared appointment reminder cadence + recipient resolution.
 * Implements BR-191 — one schedule for every create path.
 * Default cadence is 24h / 1h / 30m. Org settings may override offsets;
 * callers must not hardcode reminder times in UI or Agenda.
 */

const { normalizePhoneNumber, formatPhoneForStorage } = require("./phoneNormalizer");
const { getOrganizationSettings } = require("./organizationSettingsEngine");

const REMINDER_TYPES = Object.freeze({
  CONFIRMATION: "confirmation",
  REMINDER_24H: "reminder_24h",
  REMINDER_1H: "reminder_1h",
  REMINDER_30M: "reminder_30m",
  REMINDER_15M: "reminder_15m"
});

const DEFAULT_REMINDER_OFFSETS_MINUTES = Object.freeze([24 * 60, 60, 30]);

const OFFSET_TO_TYPE = Object.freeze({
  1440: REMINDER_TYPES.REMINDER_24H,
  60: REMINDER_TYPES.REMINDER_1H,
  30: REMINDER_TYPES.REMINDER_30M
});

const ACTIVE_APPOINTMENT_STATUSES = Object.freeze([
  "scheduled",
  "confirmed",
  "rescheduled",
  "pending_confirmation"
]);

function reminderTypeForOffset(offsetMinutes) {
  const offset = Number(offsetMinutes);
  if (OFFSET_TO_TYPE[offset]) {
    return OFFSET_TO_TYPE[offset];
  }
  if (offset === 15) {
    return REMINDER_TYPES.REMINDER_15M;
  }
  return null;
}

function normalizeOffsetMinutes(raw) {
  if (!Array.isArray(raw)) {
    return null;
  }
  const offsets = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0 && value !== 15);
  return offsets.length ? offsets : null;
}

/**
 * Resolve reminder cadence. Prefer explicit settings, then org settings,
 * then the global default. Never invent per-screen times.
 */
function resolveAppointmentReminderSchedule(settings = null) {
  const orgSettings = settings && typeof settings === "object" ? settings : getOrganizationSettings() || {};
  const offsets =
    normalizeOffsetMinutes(orgSettings.appointmentReminderOffsetsMinutes) ||
    normalizeOffsetMinutes(orgSettings.appointmentReminders?.offsetsMinutes) ||
    DEFAULT_REMINDER_OFFSETS_MINUTES;

  return offsets
    .map((offsetMinutes) => {
      const type = reminderTypeForOffset(offsetMinutes);
      if (!type || type === REMINDER_TYPES.REMINDER_15M) {
        return null;
      }
      return { type, offsetMinutes };
    })
    .filter(Boolean);
}

function resolveReminderRecipientPhone(appointment = {}) {
  const raw =
    appointment.prospectPhone ||
    appointment.metadata?.agendaContactPhone ||
    appointment.metadata?.prospectPhone ||
    null;
  const normalized = normalizePhoneNumber(raw);
  return formatPhoneForStorage(normalized);
}

function isActiveFutureAppointment(appointment, now = new Date()) {
  const status = String(appointment?.status || "").toLowerCase();
  if (!ACTIVE_APPOINTMENT_STATUSES.includes(status)) {
    return false;
  }
  const startMs = Date.parse(appointment.startDateTime);
  return Number.isFinite(startMs) && startMs > now.getTime();
}

module.exports = {
  REMINDER_TYPES,
  DEFAULT_REMINDER_OFFSETS_MINUTES,
  ACTIVE_APPOINTMENT_STATUSES,
  resolveAppointmentReminderSchedule,
  resolveReminderRecipientPhone,
  isActiveFutureAppointment
};
