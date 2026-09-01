/**
 * BR-204 — Canonical recorded appointment/interview outcome.
 * Surfaces must consume this field, not infer independently from status,
 * current_step, follow-up existence, or agenda presence.
 *
 * FOLLOW_UP_NEEDED means the appointment outcome is complete and the
 * prospect/contact may still have an active follow-up workflow.
 */

const {
  APPOINTMENT_OUTCOMES,
  APPOINTMENT_STATUSES
} = require("./configuration/appointmentDomain");

const OUTCOME_COMPLETE_SLUGS = new Set([
  APPOINTMENT_OUTCOMES.FOLLOW_UP,
  APPOINTMENT_OUTCOMES.RECRUITED,
  APPOINTMENT_OUTCOMES.CLIENT,
  APPOINTMENT_OUTCOMES.NO_SHOW,
  APPOINTMENT_OUTCOMES.CANCELLED,
  APPOINTMENT_OUTCOMES.NOT_INTERESTED,
  APPOINTMENT_OUTCOMES.COMPLETED,
  APPOINTMENT_OUTCOMES.OTHER
]);

const UNRESOLVED_STATUSES = new Set([
  APPOINTMENT_STATUSES.DRAFT,
  APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
  APPOINTMENT_STATUSES.SCHEDULED,
  APPOINTMENT_STATUSES.CONFIRMED,
  APPOINTMENT_STATUSES.IN_PROGRESS,
  APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED,
  APPOINTMENT_STATUSES.RESCHEDULED
]);

const OUTCOME_ALIASES = Object.freeze({
  follow_up: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  follow_up_needed: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  needs_more_time: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  thinking_about_it: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  requested_more_information: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  wants_to_talk_to_spouse: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  call_back_later: APPOINTMENT_OUTCOMES.FOLLOW_UP,
  recruited: APPOINTMENT_OUTCOMES.RECRUITED,
  pending_iba: APPOINTMENT_OUTCOMES.RECRUITED,
  pending_license: APPOINTMENT_OUTCOMES.RECRUITED,
  orientation_scheduled: APPOINTMENT_OUTCOMES.RECRUITED,
  client: APPOINTMENT_OUTCOMES.CLIENT,
  became_client: APPOINTMENT_OUTCOMES.CLIENT,
  fna_scheduled: APPOINTMENT_OUTCOMES.CLIENT,
  application_pending: APPOINTMENT_OUTCOMES.CLIENT,
  policy_submitted: APPOINTMENT_OUTCOMES.CLIENT,
  no_show: APPOINTMENT_OUTCOMES.NO_SHOW,
  cancelled: APPOINTMENT_OUTCOMES.CANCELLED,
  not_interested: APPOINTMENT_OUTCOMES.NOT_INTERESTED,
  not_qualified: APPOINTMENT_OUTCOMES.NOT_INTERESTED,
  already_working_with_another_company: APPOINTMENT_OUTCOMES.NOT_INTERESTED,
  unable_to_contact: APPOINTMENT_OUTCOMES.NOT_INTERESTED,
  rescheduled: APPOINTMENT_OUTCOMES.RESCHEDULED,
  reschedule_interview: APPOINTMENT_OUTCOMES.RESCHEDULED,
  completed: APPOINTMENT_OUTCOMES.COMPLETED,
  other: APPOINTMENT_OUTCOMES.OTHER
});

const RECORDED_OUTCOME_LABELS = new Set([
  "Recruited",
  "Became Client",
  "Rescheduled",
  "Reschedule Interview",
  "No Show",
  "Follow Up Needed",
  "Needs More Time",
  "Not Interested",
  "Not Qualified",
  "Pending IBA",
  "Pending License",
  "Orientation Scheduled",
  "FNA Scheduled",
  "Application Pending",
  "Policy Submitted",
  "Thinking About It",
  "Requested More Information",
  "Wants to Talk to Spouse",
  "Call Back Later",
  "Unable to Contact",
  "Already Working with Another Company"
]);

function slugifyOutcome(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeCanonicalOutcome(value) {
  if (value == null || value === "") {
    return null;
  }

  const slug = slugifyOutcome(value);
  if (!slug) {
    return null;
  }

  return OUTCOME_ALIASES[slug] || (OUTCOME_COMPLETE_SLUGS.has(slug) ? slug : slug);
}

function resolveCanonicalAppointmentOutcome(appointment = {}) {
  return normalizeCanonicalOutcome(appointment?.outcome);
}

function isActiveMovedReschedule(appointment = {}) {
  const status = String(appointment?.status || "").toLowerCase();
  const slug = resolveCanonicalAppointmentOutcome(appointment);
  return status === APPOINTMENT_STATUSES.RESCHEDULED && !OUTCOME_COMPLETE_SLUGS.has(slug);
}

function hasCanonicalRecordedOutcome(appointment = {}) {
  const slug = resolveCanonicalAppointmentOutcome(appointment);
  if (!slug) {
    return false;
  }

  if (OUTCOME_COMPLETE_SLUGS.has(slug)) {
    return true;
  }

  // Recorded RESCHEDULED on the original row (not the live moved appointment).
  if (slug === APPOINTMENT_OUTCOMES.RESCHEDULED) {
    return String(appointment?.status || "").toLowerCase() !== APPOINTMENT_STATUSES.RESCHEDULED;
  }

  return false;
}

function isRecordedInterviewOutcomeValue(value) {
  if (value == null || value === "") {
    return false;
  }

  if (RECORDED_OUTCOME_LABELS.has(String(value).trim())) {
    return true;
  }

  const slug = normalizeCanonicalOutcome(value);
  return Boolean(slug && (OUTCOME_COMPLETE_SLUGS.has(slug) || slug === APPOINTMENT_OUTCOMES.RESCHEDULED));
}

function resolveOutcomeCompleteListStatus(appointment = {}) {
  if (!hasCanonicalRecordedOutcome(appointment)) {
    return null;
  }

  const slug = resolveCanonicalAppointmentOutcome(appointment);
  if (slug === APPOINTMENT_OUTCOMES.CANCELLED) {
    return APPOINTMENT_STATUSES.CANCELLED;
  }

  if (slug === APPOINTMENT_OUTCOMES.NO_SHOW) {
    return APPOINTMENT_STATUSES.NO_SHOW;
  }

  return APPOINTMENT_STATUSES.COMPLETED;
}

function isAppointmentOutcomeComplete(appointment = {}) {
  return hasCanonicalRecordedOutcome(appointment);
}

function detectOutcomeStateMismatch(appointment = {}, readModel = {}) {
  if (!hasCanonicalRecordedOutcome(appointment)) {
    return null;
  }

  const rawStatus = String(appointment?.status || "").toLowerCase();
  const rawLifecycle = String(appointment?.metadata?.lifecycleState || "").toLowerCase();
  const persistedLooksUnresolved =
    UNRESOLVED_STATUSES.has(rawStatus) &&
    rawLifecycle !== "completed" &&
    rawLifecycle !== "cancelled" &&
    rawLifecycle !== "recruited" &&
    rawLifecycle !== "became_client" &&
    rawLifecycle !== "no_show";

  const readModelUnresolved =
    readModel.unresolved === true ||
    readModel.outcomePending === true ||
    readModel.gateActive === true;

  if (!persistedLooksUnresolved && !readModelUnresolved) {
    return null;
  }

  return {
    type: "OUTCOME_STATE_MISMATCH",
    severity: "HIGH",
    outcome: resolveCanonicalAppointmentOutcome(appointment),
    status: appointment.status || null,
    lifecycleState: appointment.metadata?.lifecycleState || null
  };
}

function maybeEmitOutcomeStateMismatch(appointment = {}, readModel = {}) {
  const mismatch = detectOutcomeStateMismatch(appointment, readModel);
  if (!mismatch) {
    return null;
  }

  if (process.env.NODE_ENV !== "test" && !process.env.NODE_TEST_CONTEXT) {
    console.warn("[br-204] OUTCOME_STATE_MISMATCH", {
      appointmentId: appointment.id || null,
      outcome: mismatch.outcome,
      status: mismatch.status,
      lifecycleState: mismatch.lifecycleState
    });
  }
  return mismatch;
}

module.exports = {
  OUTCOME_COMPLETE_SLUGS,
  OUTCOME_ALIASES,
  normalizeCanonicalOutcome,
  resolveCanonicalAppointmentOutcome,
  isActiveMovedReschedule,
  hasCanonicalRecordedOutcome,
  isRecordedInterviewOutcomeValue,
  resolveOutcomeCompleteListStatus,
  isAppointmentOutcomeComplete,
  detectOutcomeStateMismatch,
  maybeEmitOutcomeStateMismatch
};
