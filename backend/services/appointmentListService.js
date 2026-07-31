/**
 * Sprint 22.1 — Unified appointment listing (atlas_appointments + prospect-derived).
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const { loadProspectsForOrganization, findProspectInOrganization } = require("../services/supabaseService");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const {
  buildProspectDerivedAppointment,
  matchesListFilters,
  appointmentIdentityKey,
  prospectMatchesAgent,
  parseProspectDerivedAppointmentId,
  buildPersistedScopeFilters,
  mergeUnifiedAppointmentList
} = require("../core/appointmentListQuery");

async function loadProspectDerivedAppointments(filters = {}) {
  if (!filters.organizationId || filters.includeProspectDerived === false) {
    return [];
  }

  let prospects = [];

  prospects = filterProductionProspects(
    await loadProspectsForOrganization(filters.organizationId)
  );

  return prospects
    .filter((prospect) => prospectMatchesAgent(prospect, filters.agentId))
    .map((prospect) => buildProspectDerivedAppointment(prospect, filters.organizationId))
    .filter(Boolean)
    .filter((appointment) => matchesListFilters(appointment, filters));
}

async function resolveProspectDerivedAppointmentById(id, organizationId, agentId) {
  const parsed = parseProspectDerivedAppointmentId(id);

  if (!parsed || !organizationId) {
    return null;
  }

  const prospect = await findProspectInOrganization(parsed.phone, organizationId);

  if (!prospect) {
    return null;
  }

  if (agentId && !prospectMatchesAgent(prospect, agentId)) {
    return null;
  }

  const derived = buildProspectDerivedAppointment(prospect, organizationId);

  if (!derived) {
    return null;
  }

  const derivedTimestamp = Date.parse(derived.startDateTime);

  if (derivedTimestamp !== parsed.timestampMs) {
    return null;
  }

  return derived;
}

async function listUnifiedAppointments(filters = {}) {
  const repositoryResult = await appointmentRepository.search(filters);
  const derivedCandidates = await loadProspectDerivedAppointments(filters);
  const persistedScope = await appointmentRepository.search(buildPersistedScopeFilters(filters));
  const persistedIdentityKeys = new Set(persistedScope.items.map(appointmentIdentityKey));
  const merged = mergeUnifiedAppointmentList(
    repositoryResult.items,
    derivedCandidates,
    persistedIdentityKeys
  );

  return {
    items: merged,
    total: merged.length
  };
}

module.exports = {
  listUnifiedAppointments,
  loadProspectDerivedAppointments,
  resolveProspectDerivedAppointmentById
};
