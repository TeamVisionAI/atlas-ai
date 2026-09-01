/**
 * BR-204 — Canonical recorded appointment/interview outcome (UI).
 * FOLLOW_UP_NEEDED completes the appointment; follow-up workflow may stay active.
 */

export const APPOINTMENT_OUTCOME_SLUGS = Object.freeze({
  FOLLOW_UP: "follow_up",
  RECRUITED: "recruited",
  CLIENT: "client",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
  NOT_INTERESTED: "not_interested",
  RESCHEDULED: "rescheduled",
  COMPLETED: "completed",
  OTHER: "other"
});

const OUTCOME_COMPLETE_SLUGS = new Set([
  APPOINTMENT_OUTCOME_SLUGS.FOLLOW_UP,
  APPOINTMENT_OUTCOME_SLUGS.RECRUITED,
  APPOINTMENT_OUTCOME_SLUGS.CLIENT,
  APPOINTMENT_OUTCOME_SLUGS.NO_SHOW,
  APPOINTMENT_OUTCOME_SLUGS.CANCELLED,
  APPOINTMENT_OUTCOME_SLUGS.NOT_INTERESTED,
  APPOINTMENT_OUTCOME_SLUGS.COMPLETED,
  APPOINTMENT_OUTCOME_SLUGS.OTHER
]);

const OUTCOME_ALIASES = Object.freeze({
  follow_up: APPOINTMENT_OUTCOME_SLUGS.FOLLOW_UP,
  follow_up_needed: APPOINTMENT_OUTCOME_SLUGS.FOLLOW_UP,
  needs_more_time: APPOINTMENT_OUTCOME_SLUGS.FOLLOW_UP,
  recruited: APPOINTMENT_OUTCOME_SLUGS.RECRUITED,
  client: APPOINTMENT_OUTCOME_SLUGS.CLIENT,
  became_client: APPOINTMENT_OUTCOME_SLUGS.CLIENT,
  no_show: APPOINTMENT_OUTCOME_SLUGS.NO_SHOW,
  cancelled: APPOINTMENT_OUTCOME_SLUGS.CANCELLED,
  not_interested: APPOINTMENT_OUTCOME_SLUGS.NOT_INTERESTED,
  rescheduled: APPOINTMENT_OUTCOME_SLUGS.RESCHEDULED,
  reschedule_interview: APPOINTMENT_OUTCOME_SLUGS.RESCHEDULED,
  completed: APPOINTMENT_OUTCOME_SLUGS.COMPLETED,
  other: APPOINTMENT_OUTCOME_SLUGS.OTHER
});

export function normalizeCanonicalOutcome(value) {
  if (value == null || value === "") {
    return null;
  }

  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  if (!slug) {
    return null;
  }

  return OUTCOME_ALIASES[slug] || (OUTCOME_COMPLETE_SLUGS.has(slug) ? slug : slug);
}

export function resolveCanonicalAppointmentOutcome(appointment = {}) {
  return normalizeCanonicalOutcome(appointment?.outcome);
}

export function hasCanonicalRecordedOutcome(appointment = {}) {
  const slug = resolveCanonicalAppointmentOutcome(appointment);
  if (!slug) {
    return false;
  }

  if (OUTCOME_COMPLETE_SLUGS.has(slug)) {
    return true;
  }

  if (slug === APPOINTMENT_OUTCOME_SLUGS.RESCHEDULED) {
    return String(appointment?.status || "").toLowerCase() !== "rescheduled";
  }

  return false;
}

export function resolveOutcomeCompleteDisplayStatus(appointment = {}) {
  if (!hasCanonicalRecordedOutcome(appointment)) {
    return null;
  }

  const slug = resolveCanonicalAppointmentOutcome(appointment);
  if (slug === APPOINTMENT_OUTCOME_SLUGS.CANCELLED) {
    return "cancelled";
  }

  if (slug === APPOINTMENT_OUTCOME_SLUGS.NO_SHOW) {
    return "no_show";
  }

  if (slug === APPOINTMENT_OUTCOME_SLUGS.RESCHEDULED) {
    return "rescheduled";
  }

  return "completed";
}

export function canonicalOutcomeLabel(outcome) {
  const slug = normalizeCanonicalOutcome(outcome);
  switch (slug) {
    case APPOINTMENT_OUTCOME_SLUGS.FOLLOW_UP:
      return "FOLLOW_UP_NEEDED";
    case APPOINTMENT_OUTCOME_SLUGS.RECRUITED:
      return "RECRUITED";
    case APPOINTMENT_OUTCOME_SLUGS.CLIENT:
      return "BECAME_CLIENT";
    case APPOINTMENT_OUTCOME_SLUGS.NO_SHOW:
      return "NO_SHOW";
    case APPOINTMENT_OUTCOME_SLUGS.NOT_INTERESTED:
      return "NOT_INTERESTED";
    case APPOINTMENT_OUTCOME_SLUGS.RESCHEDULED:
      return "RESCHEDULED";
    case APPOINTMENT_OUTCOME_SLUGS.CANCELLED:
      return "CANCELLED";
    default:
      return slug;
  }
}
