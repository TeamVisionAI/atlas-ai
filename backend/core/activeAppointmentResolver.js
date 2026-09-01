/**
 * Resolves the active (non-terminal) appointment for a prospect.
 * Delegates to appointmentListService — persisted atlas_appointments only.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const { resolvePersistedAppointmentId, isPersistedAppointment } = require("./appointmentListQuery");
const { findPersistedAppointmentForProspect } = require("../services/appointmentListService");
const { hasCanonicalRecordedOutcome } = require("./appointmentOutcomeState");

const ACTIVE_APPOINTMENT_STATUSES = new Set([
  "draft",
  "pending_confirmation",
  "scheduled",
  "confirmed",
  "rescheduled",
  "in_progress",
  "human_assist_required"
]);

const TERMINAL_APPOINTMENT_LIFECYCLE_STATES = new Set([
  "completed",
  "cancelled",
  "recruited",
  "became_client",
  "no_show"
]);

function isActiveAppointment(appointment = {}) {
  if (hasCanonicalRecordedOutcome(appointment)) {
    return false;
  }

  const lifecycleState = appointment.metadata?.lifecycleState;

  if (lifecycleState && TERMINAL_APPOINTMENT_LIFECYCLE_STATES.has(lifecycleState)) {
    return false;
  }

  return ACTIVE_APPOINTMENT_STATUSES.has(appointment.status);
}

async function findActiveAppointmentForProspect(prospectPhone, organizationId, agentId = null) {
  return findPersistedAppointmentForProspect(prospectPhone, organizationId, agentId);
}

async function findAppointmentById(id, organizationId) {
  if (!id || !organizationId) {
    return null;
  }

  return appointmentRepository.findById(id, organizationId);
}

module.exports = {
  ACTIVE_APPOINTMENT_STATUSES,
  TERMINAL_APPOINTMENT_LIFECYCLE_STATES,
  isActiveAppointment,
  isPersistedAppointment,
  resolvePersistedAppointmentId,
  findActiveAppointmentForProspect,
  findPersistedAppointmentForProspect,
  findAppointmentById
};
