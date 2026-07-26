/**
 * Sprint 18.2 — Generic appointment types for SchedulingService.
 * No interview-specific services — types are data-driven labels.
 */

const APPOINTMENT_TYPES = Object.freeze({
  INTERVIEW: "interview",
  FNA: "fna",
  POLICY_DELIVERY: "policy_delivery",
  ORIENTATION: "orientation",
  TRAINING: "training",
  MEETING: "meeting",
  COACHING: "coaching"
});

const APPOINTMENT_TYPE_VALUES = Object.freeze(Object.values(APPOINTMENT_TYPES));

/** Default duration in minutes per appointment type. */
const DEFAULT_DURATIONS = Object.freeze({
  [APPOINTMENT_TYPES.INTERVIEW]: 30,
  [APPOINTMENT_TYPES.FNA]: 60,
  [APPOINTMENT_TYPES.POLICY_DELIVERY]: 45,
  [APPOINTMENT_TYPES.ORIENTATION]: 60,
  [APPOINTMENT_TYPES.TRAINING]: 90,
  [APPOINTMENT_TYPES.MEETING]: 30,
  [APPOINTMENT_TYPES.COACHING]: 45
});

function isValidAppointmentType(type) {
  return APPOINTMENT_TYPE_VALUES.includes(type);
}

function resolveDurationMinutes(appointmentType, explicitDuration) {
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }

  return DEFAULT_DURATIONS[appointmentType] || 30;
}

module.exports = {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_DURATIONS,
  isValidAppointmentType,
  resolveDurationMinutes
};
