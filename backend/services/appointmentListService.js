/**
 * Sprint 22.1 — Appointment listing (persisted atlas_appointments only).
 * Appointment invariant: operational surfaces use persisted UUIDs only.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const {
  buildPersistedScopeFilters,
  isPersistedAppointment,
  matchesListFilters,
  selectActivePersistedAppointmentForProspect
} = require("../core/appointmentListQuery");

/**
 * Persisted atlas_appointments only — canonical list path for the Appointments module.
 */
async function listPersistedAppointments(filters = {}, options = {}) {
  const reference = options.reference || new Date();
  const result = await appointmentRepository.search(buildPersistedScopeFilters(filters));
  const items = (result.items || [])
    .filter(isPersistedAppointment)
    .filter((appointment) => matchesListFilters(appointment, filters, reference));

  return {
    items,
    total: items.length
  };
}

/**
 * Resolves the active persisted appointment for a prospect.
 * Canonical for Prospect Workspace, Mission Control, and operational flows.
 */
async function findPersistedAppointmentForProspect(prospectPhone, organizationId, agentId = null) {
  if (!prospectPhone || !organizationId) {
    return null;
  }

  const filters = {
    organizationId,
    prospectPhone
  };

  if (agentId) {
    filters.agentId = agentId;
  }

  const result = await listPersistedAppointments(filters);
  return selectActivePersistedAppointmentForProspect(result.items);
}

/** @deprecated Use listPersistedAppointments — unified merge removed. */
async function listUnifiedAppointments(filters = {}) {
  return listPersistedAppointments(filters);
}

module.exports = {
  listUnifiedAppointments,
  listPersistedAppointments,
  findPersistedAppointmentForProspect
};
