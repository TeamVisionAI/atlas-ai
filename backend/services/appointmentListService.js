/**
 * Sprint 22.1 — Appointment listing (persisted atlas_appointments only).
 * Appointment invariant: operational surfaces use persisted UUIDs only.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { buildRecruiterHandoff } = require("../core/appointmentHandoffReadModel");
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

/**
 * Latest persisted appointment for a prospect, including terminal lifecycle states.
 * Used by read models to reflect cancelled/completed outcomes after active selection clears.
 */
async function findLatestPersistedAppointmentForProspect(prospectPhone, organizationId, agentId = null) {
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
  const items = result.items || [];

  if (!items.length) {
    return null;
  }

  items.sort(
    (left, right) =>
      Date.parse(right.updatedAt || right.startDateTime || 0) -
      Date.parse(left.updatedAt || left.startDateTime || 0)
  );

  return items[0];
}

/**
 * Canonical recruiter handoff for Conversation Engine and simulator surfaces (BR-050).
 */
async function resolveRecruiterHandoffForProspect(prospect) {
  if (!prospect?.phone) {
    return null;
  }

  const organizationId = prospect.organization_id || DEFAULT_ORGANIZATION_ID;
  const activeAppointment = await findPersistedAppointmentForProspect(
    prospect.phone,
    organizationId
  );
  const latestAppointment =
    activeAppointment ||
    (await findLatestPersistedAppointmentForProspect(prospect.phone, organizationId));

  return buildRecruiterHandoff(prospect, {
    activeAppointment,
    latestAppointment
  });
}

/** @deprecated Use listPersistedAppointments — unified merge removed. */
async function listUnifiedAppointments(filters = {}) {
  return listPersistedAppointments(filters);
}

module.exports = {
  listUnifiedAppointments,
  listPersistedAppointments,
  findPersistedAppointmentForProspect,
  findLatestPersistedAppointmentForProspect,
  resolveRecruiterHandoffForProspect
};
