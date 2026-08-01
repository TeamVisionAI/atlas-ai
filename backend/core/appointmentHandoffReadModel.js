/**
 * BR-050 — Canonical recruiter handoff read model.
 * Derives handoff readiness from persisted appointment lifecycle, not prospect.current_step.
 */

const { APPOINTMENT_STATUSES } = require("./configuration/appointmentDomain");
const { extractEmailFromNotes } = require("./informationModel");
const { resolveAppointmentListStatus } = require("./appointmentListQuery");

const HANDOFF_PHASES = Object.freeze({
  NONE: "none",
  ACTIVE: "active",
  TERMINAL: "terminal",
  INCONSISTENT: "inconsistent"
});

const HANDOFF_LIFECYCLE = Object.freeze({
  NONE: "none",
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  RESCHEDULED: "rescheduled",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
  UNAVAILABLE: "unavailable"
});

const ACTIVE_HANDOFF_STATUSES = Object.freeze([
  APPOINTMENT_STATUSES.SCHEDULED,
  APPOINTMENT_STATUSES.CONFIRMED,
  APPOINTMENT_STATUSES.RESCHEDULED,
  APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
  APPOINTMENT_STATUSES.IN_PROGRESS
]);

const TERMINAL_HANDOFF_STATUSES = Object.freeze([
  APPOINTMENT_STATUSES.CANCELLED,
  APPOINTMENT_STATUSES.COMPLETED,
  APPOINTMENT_STATUSES.NO_SHOW
]);

function mapInterviewTypeForHandoff(appointment, prospect) {
  if (appointment?.meetingType === "in_person") {
    return "Office";
  }

  if (appointment?.meetingProvider === "zoom" || appointment?.meetingType === "virtual") {
    return "Zoom";
  }

  if (prospect?.interview_type === "In Person") {
    return "Office";
  }

  return prospect?.interview_type || null;
}

function isInPersonHandoffType(interviewType) {
  const normalized = String(interviewType || "").toLowerCase();
  return normalized.includes("office") || normalized.includes("in person") || normalized.includes("person");
}

function mapCanonicalStatusToHandoffLifecycle(canonicalStatus) {
  switch (canonicalStatus) {
    case APPOINTMENT_STATUSES.SCHEDULED:
      return HANDOFF_LIFECYCLE.SCHEDULED;
    case APPOINTMENT_STATUSES.CONFIRMED:
      return HANDOFF_LIFECYCLE.CONFIRMED;
    case APPOINTMENT_STATUSES.RESCHEDULED:
      return HANDOFF_LIFECYCLE.RESCHEDULED;
    case APPOINTMENT_STATUSES.CANCELLED:
      return HANDOFF_LIFECYCLE.CANCELLED;
    case APPOINTMENT_STATUSES.COMPLETED:
      return HANDOFF_LIFECYCLE.COMPLETED;
    case APPOINTMENT_STATUSES.NO_SHOW:
      return HANDOFF_LIFECYCLE.NO_SHOW;
    default:
      return HANDOFF_LIFECYCLE.UNAVAILABLE;
  }
}

function resolveHandoffPhase(canonicalStatus, hasActiveAppointment) {
  if (ACTIVE_HANDOFF_STATUSES.includes(canonicalStatus) && hasActiveAppointment) {
    return HANDOFF_PHASES.ACTIVE;
  }

  if (TERMINAL_HANDOFF_STATUSES.includes(canonicalStatus)) {
    return HANDOFF_PHASES.TERMINAL;
  }

  if (hasActiveAppointment) {
    return HANDOFF_PHASES.INCONSISTENT;
  }

  return HANDOFF_PHASES.NONE;
}

/**
 * Pure handoff projection — pass appointments from appointmentListService.
 * Prospect workflow fields are exposed for diagnostics only; they do not gate readiness.
 */
function buildRecruiterHandoff(prospect, { activeAppointment = null, latestAppointment = null } = {}) {
  if (!prospect) {
    return null;
  }

  const email = extractEmailFromNotes(prospect.notes);
  const qualified = prospect.work_authorized === true;
  const prospectWorkflowStep = prospect.current_step || null;

  if (!activeAppointment && !latestAppointment) {
    return {
      qualified,
      interviewType: mapInterviewTypeForHandoff(null, prospect),
      interviewTime: prospect.interview_time || null,
      email,
      handoffReady: false,
      appointmentId: null,
      appointmentLifecycle: HANDOFF_LIFECYCLE.NONE,
      handoffPhase: HANDOFF_PHASES.NONE,
      prospectWorkflowStep
    };
  }

  const referenceAppointment = activeAppointment || latestAppointment;
  const canonicalStatus = resolveAppointmentListStatus(referenceAppointment);
  const appointmentLifecycle = mapCanonicalStatusToHandoffLifecycle(canonicalStatus);
  const handoffPhase = resolveHandoffPhase(canonicalStatus, Boolean(activeAppointment));
  const interviewType = mapInterviewTypeForHandoff(referenceAppointment, prospect);
  const interviewTime = referenceAppointment.startDateTime || prospect.interview_time || null;
  const calendarLinked = activeAppointment
    ? Boolean(activeAppointment.calendarEventId)
    : Boolean(referenceAppointment.calendarEventId || prospect.calendar_event_id);

  const handoffReady =
    handoffPhase === HANDOFF_PHASES.ACTIVE &&
    qualified &&
    calendarLinked &&
    (Boolean(email) || isInPersonHandoffType(interviewType));

  return {
    qualified,
    interviewType,
    interviewTime,
    email,
    handoffReady,
    appointmentId: referenceAppointment.id || null,
    appointmentLifecycle,
    handoffPhase,
    prospectWorkflowStep
  };
}

module.exports = {
  HANDOFF_PHASES,
  HANDOFF_LIFECYCLE,
  ACTIVE_HANDOFF_STATUSES,
  TERMINAL_HANDOFF_STATUSES,
  buildRecruiterHandoff,
  mapCanonicalStatusToHandoffLifecycle,
  resolveHandoffPhase
};
