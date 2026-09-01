/**
 * BR-206 — in-memory atlas_agenda_recruits store for synthetic tests.
 */

const crypto = require("crypto");

function clone(row) {
  return row ? { ...row } : null;
}

function createMemoryAgendaRecruitStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));

  return {
    async save(record) {
      const saved = {
        ...record,
        id: record.id || crypto.randomUUID(),
        updatedAt: record.updatedAt || new Date().toISOString()
      };
      rows.set(saved.id, clone(saved));
      return clone(saved);
    },

    async findById(id, organizationId) {
      const row = rows.get(id);
      if (!row) return null;
      if (organizationId && row.organizationId !== organizationId) return null;
      return clone(row);
    },

    async findByAgendaContactId(agendaContactId, organizationId) {
      return (
        [...rows.values()].find(
          (row) =>
            row.agendaContactId === agendaContactId &&
            (!organizationId || row.organizationId === organizationId)
        ) || null
      );
    },

    async findByAppointmentId(appointmentId, organizationId) {
      return (
        [...rows.values()].find(
          (row) =>
            row.appointmentId === appointmentId &&
            (!organizationId || row.organizationId === organizationId)
        ) || null
      );
    },

    async listForOrganization(organizationId) {
      return [...rows.values()]
        .filter((row) => row.organizationId === organizationId)
        .map(clone);
    }
  };
}

module.exports = {
  createMemoryAgendaRecruitStore
};
