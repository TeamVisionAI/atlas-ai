/**
 * Sprint 6.1 — JSON file implementation of MetaWhatsAppConnectionRepository (development).
 *
 * TODO(production): Replace with Supabase-backed repository implementing the same interface.
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
      return null;
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch (error) {
    metaLogger.error("repository_read_failed", { message: error.message });
    return null;
  }
}

function writeRawStore(connection) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify(
      {
        connection,
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

  async function saveConnection(record) {
    const now = new Date().toISOString();
    const existing = normalizeStoredConnection(readRawStore()?.connection);
    const encryptedToken = tokenEncryption.encrypt(record.access_token);

    const connection = {
      waba_id: record.waba_id,
      phone_number_id: record.phone_number_id,
      connection_type: record.connection_type || "whatsapp_business_app",
      status: record.status || "connected",
      access_token_encrypted: encryptedToken,
      display_phone_number: record.display_phone_number || null,
      verified_name: record.verified_name || null,
      last_health_status: record.last_health_status || existing?.last_health_status || null,
      last_health_checked_at:
        record.last_health_checked_at || existing?.last_health_checked_at || null,
      created_at: existing?.created_at || now,
      updated_at: now
    };

    writeRawStore(connection);
    metaLogger.info("connection_saved", {
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      storageKind: "json_file",
      tokenEncrypted: tokenEncryption.isEncrypted(connection.access_token_encrypted)
    });

    return connection;
  }

  async function getConnection() {
    return normalizeStoredConnection(readRawStore()?.connection);
  }

  async function getDecryptedAccessToken() {
    const connection = await getConnection();

    if (!connection?.access_token_encrypted) {
      return null;
    }

    return tokenEncryption.decrypt(connection.access_token_encrypted);
  }

  async function updateConnection(patch = {}) {
    const existing = await getConnection();

    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    };

    writeRawStore(updated);
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
    getStorageKind
  });
}

module.exports = {
  createJsonMetaWhatsAppConnectionRepository,
  STORE_FILE
};
