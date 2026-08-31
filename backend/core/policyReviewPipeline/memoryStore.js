/**
 * BR-186 — in-memory policy-review pipeline store for synthetic tests.
 */

function clone(row) {
  if (!row) return null;
  return {
    ...row,
    history: [...(row.history || [])],
    stageTimestamps: { ...(row.stageTimestamps || {}) },
    acquisition: row.acquisition ? JSON.parse(JSON.stringify(row.acquisition)) : { firstTouch: {}, latestTouch: {} }
  };
}

function createMemoryPolicyReviewStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));
  const defaults = new Map();

  return {
    async save(record) {
      const saved = {
        ...record,
        id: record.id || require("crypto").randomUUID(),
        history: record.history || [],
        stageTimestamps: record.stageTimestamps || {},
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
    },

    async findByLinkedProspectId(linkedProspectId, organizationId) {
      if (!linkedProspectId) return null;
      const row = [...rows.values()].find(
        (item) =>
          String(item.linkedProspectId) === String(linkedProspectId) &&
          (!organizationId || item.organizationId === organizationId)
      );
      return clone(row);
    },

    async saveCommissionDefault(record) {
      const key = `${record.organizationId}:${record.userId || "org"}`;
      const saved = {
        organizationId: record.organizationId,
        userId: record.userId || null,
        commissionLevelPct: record.commissionLevelPct,
        paidAdvanceFactorPct: record.paidAdvanceFactorPct,
        updatedAt: record.updatedAt || new Date().toISOString()
      };
      defaults.set(key, { ...saved });
      return { ...saved };
    },

    async listCommissionDefaults(organizationId) {
      return [...defaults.values()]
        .filter((item) => item.organizationId === organizationId)
        .map((item) => ({ ...item }));
    }
  };
}

module.exports = {
  createMemoryPolicyReviewStore
};
