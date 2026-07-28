/**
 * Sprint 20.1 — JSON file implementation (development fallback, org-scoped).
 */

const fs = require("fs");
const path = require("path");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const { metaLogger } = require("../core/meta/metaLogger");
const { assertRepositoryImplementation } = require("./metaConnectionRepositoryInterface");

const STORE_FILE = path.join(__dirname, "../data/metaWhatsAppConnection.json");

function readRawStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { connections: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));

    if (parsed?.connection && !parsed.connections) {
      const legacyOrgId = parsed.connection.organization_id || "legacy-default";
      return {
        connections: {
          [legacyOrgId]: parsed.connection
        },
        updatedAt: parsed.updatedAt,
        storageKind: "json_file"
      };
    }

    return {
      connections: parsed.connections || {},
      updatedAt: parsed.updatedAt,
      storageKind: parsed.storageKind || "json_file"
    };
  } catch (error) {
    metaLogger.error("repository_read_failed", { message: error.message });
    return { connections: {} };
  }
}

function writeRawStore(connections) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify(
      {
        connections,
        updatedAt: new Date().toISOString(),
        storageKind: "json_file"
      },
      null,
      2
    )
  );
}

function normalizeStoredConnection(raw) {
  if (!raw) {
    return null;
  }

  if (raw.access_token && !raw.access_token_encrypted) {
    return {
      ...raw,
      access_token_encrypted: raw.access_token,
      access_token: undefined
    };
  }

  return raw;
}

function createJsonMetaWhatsAppConnectionRepository(options = {}) {
  const tokenEncryption = options.tokenEncryption || createTokenEncryption();

  async function getConnection(organizationId) {
    const store = readRawStore();
    return normalizeStoredConnection(store.connections?.[organizationId] || null);
  }

  async function saveConnection(organizationId, record) {
    const now = new Date().toISOString();
    const store = readRawStore();
    const existing = normalizeStoredConnection(store.connections?.[organizationId]);
    const encryptedToken = tokenEncryption.encrypt(record.access_token);

    const connection = {
      organization_id: organizationId,
      business_id: record.business_id || null,
      waba_id: record.waba_id,
      phone_number_id: record.phone_number_id,
      connection_type: record.connection_type || "whatsapp_business_app",
      status: record.status || "connected",
      access_token_encrypted: encryptedToken,
      display_phone_number: record.display_phone_number || null,
      business_name: record.business_name || record.verified_name || null,
      verified_name: record.verified_name || record.business_name || null,
      last_health_status: record.last_health_status || existing?.last_health_status || "healthy",
      last_health_checked_at: record.last_health_checked_at || now,
      connected_at: record.connected_at || existing?.connected_at || now,
      last_sync_at: record.last_sync_at || now,
      created_at: existing?.created_at || now,
      updated_at: now
    };

    store.connections[organizationId] = connection;
    writeRawStore(store.connections);

    metaLogger.info("whatsapp_integration_saved", {
      organizationId,
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      storageKind: "json_file",
      tokenEncrypted: tokenEncryption.isEncrypted(connection.access_token_encrypted)
    });

    return connection;
  }

  async function getDecryptedAccessToken(organizationId) {
    const connection = await getConnection(organizationId);

    if (!connection?.access_token_encrypted || connection.status !== "connected") {
      return null;
    }

    return tokenEncryption.decrypt(connection.access_token_encrypted);
  }

  async function updateConnection(organizationId, patch = {}) {
    const store = readRawStore();
    const existing = normalizeStoredConnection(store.connections?.[organizationId]);

    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      ...patch,
      organization_id: organizationId,
      updated_at: now,
      last_sync_at: patch.last_sync_at || now
    };

    delete updated.access_token;

    store.connections[organizationId] = updated;
    writeRawStore(store.connections);
    return updated;
  }

  async function disconnectConnection(organizationId) {
    const store = readRawStore();
    const existing = normalizeStoredConnection(store.connections?.[organizationId]);

    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      status: "disconnected",
      access_token_encrypted: null,
      last_health_status: "disconnected",
      last_health_checked_at: now,
      updated_at: now,
      last_sync_at: now
    };

    store.connections[organizationId] = updated;
    writeRawStore(store.connections);
    return updated;
  }

  function getStorageKind() {
    return "json_file";
  }

  return assertRepositoryImplementation({
    saveConnection,
    getConnection,
    getDecryptedAccessToken,
    updateConnection,
    disconnectConnection,
    getStorageKind
  });
}

module.exports = {
  createJsonMetaWhatsAppConnectionRepository,
  STORE_FILE
};
