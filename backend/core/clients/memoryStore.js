/**
 * BR-179 — in-memory atlas_agenda_clients store for synthetic tests.
 */

function clone(row) {
  return row ? { ...row, history: [...(row.history || [])] } : null;
}

function createMemoryClientStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));

  return {
    async save(client) {
      const saved = {
        ...client,
        id: client.id || require("crypto").randomUUID(),
        status: client.status || "ACTIVE",
        history: client.history || [],
        updatedAt: client.updatedAt || new Date().toISOString()
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

    async findByPhone(phone, organizationId) {
      if (!phone) return null;
      const row = [...rows.values()].find(
        (item) =>
          String(item.phone) === String(phone) &&
          (!organizationId || item.organizationId === organizationId)
      );
      return clone(row);
    },

    async findByAgendaContactId(agendaContactId, organizationId) {
      if (!agendaContactId) return null;
      const row = [...rows.values()].find(
        (item) =>
          item.agendaContactId === agendaContactId &&
          (!organizationId || item.organizationId === organizationId)
      );
      return clone(row);
    },

    async listForOwners({ organizationId, ownerUserIds }) {
      const owners = new Set((ownerUserIds || []).map((id) => String(id)));
      return [...rows.values()]
        .filter((item) => item.organizationId === organizationId)
        .filter((item) => !owners.size || owners.has(String(item.ownerUserId)))
        .map(clone);
    }
  };
}

module.exports = {
  createMemoryClientStore
};
