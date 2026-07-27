/**
 * Sprint 22.1 — Unified appointment listing (atlas_appointments + prospect-derived).
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const { loadProspectsForOrganization } = require("../services/supabaseService");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const {
  buildProspectDerivedAppointment,
  matchesListFilters,
  appointmentIdentityKey,
  prospectMatchesAgent
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

async function listUnifiedAppointments(filters = {}) {
  const repositoryResult = await appointmentRepository.search(filters);
  const derivedCandidates = await loadProspectDerivedAppointments(filters);

  const merged = [...repositoryResult.items];
  const seen = new Set(merged.map(appointmentIdentityKey));

  derivedCandidates.forEach((appointment) => {
    const key = appointmentIdentityKey(appointment);

    if (!seen.has(key)) {
      merged.push(appointment);
      seen.add(key);
    }
  });

  merged.sort(
    (left, right) => new Date(left.startDateTime).getTime() - new Date(right.startDateTime).getTime()
  );

  return {
    items: merged,
    total: merged.length
  };
}

module.exports = {
  listUnifiedAppointments,
  loadProspectDerivedAppointments
};
