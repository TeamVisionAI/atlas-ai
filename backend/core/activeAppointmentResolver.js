/**
 * Resolves the active (non-terminal) appointment for a prospect.
 * Shared by appointment and interview outcome flows.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const { listUnifiedAppointments } = require("../services/appointmentListService");

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
  const lifecycleState = appointment.metadata?.lifecycleState;

  if (lifecycleState && TERMINAL_APPOINTMENT_LIFECYCLE_STATES.has(lifecycleState)) {
    return false;
  }

  return ACTIVE_APPOINTMENT_STATUSES.has(appointment.status);
}

async function findActiveAppointmentForProspect(prospectPhone, organizationId, agentId = null) {
  if (!prospectPhone || !organizationId) {
    return null;
  }

  const result = await listUnifiedAppointments({
    organizationId,
    agentId,
    prospectPhone
  });

  const active = (result.items || []).filter(isActiveAppointment);

  if (!active.length) {
    return null;
  }

  active.sort(
    (left, right) => Date.parse(left.startDateTime || 0) - Date.parse(right.startDateTime || 0)
  );

  const now = Date.now();
  const upcoming = active.find((appointment) => Date.parse(appointment.startDateTime) >= now);

  return upcoming || active[active.length - 1];
}

async function findAppointmentById(id, organizationId, agentId = null) {
  if (!id || !organizationId) {
    return null;
  }

  const persisted = await appointmentRepository.findById(id, organizationId);

  if (persisted) {
    return persisted;
  }

  const { resolveProspectDerivedAppointmentById } = require("../services/appointmentListService");
  return resolveProspectDerivedAppointmentById(id, organizationId, agentId);
}

module.exports = {
  ACTIVE_APPOINTMENT_STATUSES,
  TERMINAL_APPOINTMENT_LIFECYCLE_STATES,
  isActiveAppointment,
  findActiveAppointmentForProspect,
  findAppointmentById
};
