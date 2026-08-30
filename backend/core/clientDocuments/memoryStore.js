/**
 * BR-183 — in-memory document and request stores for synthetic tests.
 */

const crypto = require("crypto");

function clone(row) {
  return row ? { ...row, history: [...(row.history || [])] } : null;
}

function createMemoryDocumentStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));
  return {
    async save(record) {
      const saved = {
        ...record,
        id: record.id || crypto.randomUUID(),
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
    async listForOwners({ organizationId, ownerUserIds, clientId, serviceCaseId } = {}) {
      const owners = ownerUserIds == null ? null : new Set(ownerUserIds.map((id) => String(id)));
      return [...rows.values()]
        .filter((item) => item.organizationId === organizationId)
        .filter((item) => !clientId || String(item.clientId) === String(clientId))
        .filter((item) => !serviceCaseId || String(item.serviceCaseId || "") === String(serviceCaseId))
        .filter((item) => !owners || owners.has(String(item.ownerUserId)))
        .map(clone);
    }
  };
}

function createMemoryDocumentRequestStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, clone(row)]));
  return {
    async save(record) {
      const saved = {
        ...record,
        id: record.id || crypto.randomUUID(),
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
    async listForOwners({ organizationId, ownerUserIds, clientId, serviceCaseId } = {}) {
      const owners = ownerUserIds == null ? null : new Set(ownerUserIds.map((id) => String(id)));
      return [...rows.values()]
        .filter((item) => item.organizationId === organizationId)
        .filter((item) => !clientId || String(item.clientId) === String(clientId))
        .filter((item) => !serviceCaseId || String(item.serviceCaseId || "") === String(serviceCaseId))
        .filter((item) => !owners || owners.has(String(item.ownerUserId)))
        .map(clone);
    }
  };
}

function createMemoryObjectStorage() {
  const objects = new Map();
  return {
    async upload({ organizationId, clientId, documentId, storageKey, buffer, mimeType }) {
      const key =
        storageKey ||
        `${organizationId || "org"}/${clientId || "client"}/${documentId || crypto.randomUUID()}/${crypto.randomUUID()}.bin`;
      objects.set(key, { buffer: Buffer.from(buffer), mimeType });
      return { storageKey: key };
    },
    async download(storageKey) {
      const row = objects.get(storageKey);
      if (!row) {
        const error = new Error("Stored document is missing.");
        error.statusCode = 404;
        error.publicCode = "DOCUMENT_NOT_FOUND";
        throw error;
      }
      return { buffer: Buffer.from(row.buffer), mimeType: row.mimeType };
    },
    async remove(storageKey) {
      objects.delete(storageKey);
    },
    has(storageKey) {
      return objects.has(storageKey);
    }
  };
}

module.exports = {
  createMemoryDocumentStore,
  createMemoryDocumentRequestStore,
  createMemoryObjectStorage
};
