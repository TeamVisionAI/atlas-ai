/**
 * BR-206 — in-memory production attribution store for synthetic tests.
 */

const crypto = require("crypto");

function clone(row) {
  return row ? { ...row } : null;
}

function createMemoryProductionAttributionStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));

  return {
    async save(record) {
      const saved = {
        ...record,
        id: record.id || crypto.randomUUID(),
        createdAt: record.createdAt || new Date().toISOString()
      };
      rows.set(saved.id, clone(saved));
      return clone(saved);
    },

    async listForProduction(productionId, organizationId) {
      return [...rows.values()]
        .filter((row) => row.productionId === productionId)
        .filter((row) => !organizationId || row.organizationId === organizationId)
        .map(clone);
    },

    async listForOrganization(organizationId) {
      return [...rows.values()]
        .filter((row) => row.organizationId === organizationId)
        .map(clone);
    }
  };
}

module.exports = {
  createMemoryProductionAttributionStore
};
