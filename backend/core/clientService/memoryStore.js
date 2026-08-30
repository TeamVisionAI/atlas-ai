/**
 * BR-182 — in-memory atlas_client_service_cases store for synthetic tests.
 */

function clone(row) {
  return row ? { ...row, history: [...(row.history || [])] } : null;
}

function createMemoryServiceStore(seed = []) {
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

    async listForOwners({ organizationId, ownerUserIds, clientId } = {}) {
      const owners = ownerUserIds == null ? null : new Set(ownerUserIds.map((id) => String(id)));
      return [...rows.values()]
        .filter((item) => item.organizationId === organizationId)
        .filter((item) => !clientId || String(item.clientId) === String(clientId))
        .filter((item) => !owners || owners.has(String(item.ownerUserId)))
        .map(clone);
    }
  };
}

module.exports = {
  createMemoryServiceStore
};
