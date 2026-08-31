/**
 * BR-181 — in-memory atlas_client_production store for synthetic tests.
 */

function clone(row) {
  return row ? { ...row, history: [...(row.history || [])] } : null;
}

function createMemoryProductionStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));

  return {
    async save(record) {
      const saved = {
        ...record,
        id: record.id || require("crypto").randomUUID(),
        history: record.history || [],
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

    async findByAppointmentId(appointmentId, organizationId) {
      if (!appointmentId) return null;
      return (
        [...rows.values()].find(
          (item) =>
            String(item.appointmentId) === String(appointmentId) &&
            (!organizationId || item.organizationId === organizationId)
        ) || null
      );
    },

    async listForOwners({ organizationId, ownerUserIds, clientId } = {}) {
      if (!organizationId) return [];
      const owners = ownerUserIds == null ? null : new Set(ownerUserIds.map((id) => String(id)));
      return [...rows.values()]
        .filter((item) => item.organizationId === organizationId)
        .filter((item) => !clientId || String(item.clientId) === String(clientId))
        .filter((item) => !owners || owners.has(String(item.ownerUserId)))
        .map(clone);
    },

    async listAllForPlatform() {
      return [...rows.values()].map(clone);
    }
  };
}

module.exports = {
  createMemoryProductionStore
};
