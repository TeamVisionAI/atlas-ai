/**
 * Sprint 11.3 — JSON file store for Meta platform OAuth (Facebook / Messenger).
 * WhatsApp remains in metaWhatsAppConnection.json when configured.
 */

const fs = require("fs");
const path = require("path");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const { metaLogger } = require("../core/meta/metaLogger");

const STORE_FILE = path.join(__dirname, "../data/metaPlatformConnection.json");

function readRawStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch (error) {
    metaLogger.error("platform_repository_read_failed", { message: error.message });
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

function toSafePlatformConnection(connection) {
  if (!connection) {
    return null;
  }

  return {
    facebookUserId: connection.facebook_user_id || null,
    facebookUserName: connection.facebook_user_name || null,
    messengerPageId: connection.messenger_page_id || null,
    facebookStatus: connection.facebook_status || null,
    messengerStatus: connection.messenger_status || null,
    whatsappStatus: connection.whatsapp_status || null,
    connectedAt: connection.created_at || null,
    updatedAt: connection.updated_at || null
  };
}

function createJsonMetaPlatformConnectionRepository(options = {}) {
  const tokenEncryption = options.tokenEncryption || createTokenEncryption();

  async function savePlatformConnection(record) {
    const now = new Date().toISOString();
    const existing = readRawStore()?.connection || null;
    const encryptedToken = tokenEncryption.encrypt(record.access_token);

    const connection = {
      facebook_user_id: record.facebook_user_id || null,
      facebook_user_name: record.facebook_user_name || null,
      messenger_page_id: record.messenger_page_id || null,
      access_token_encrypted: encryptedToken,
      facebook_status: record.facebook_status || "connected",
      messenger_status: record.messenger_status || "connected",
      whatsapp_status: record.whatsapp_status || "pending",
      created_at: existing?.created_at || now,
      updated_at: now
    };

    writeRawStore(connection);

    metaLogger.info("platform_connection_saved", {
      facebookStatus: connection.facebook_status,
      messengerStatus: connection.messenger_status,
      whatsappStatus: connection.whatsapp_status,
      storageKind: "json_file"
    });

    return connection;
  }

  async function getPlatformConnection() {
    return readRawStore()?.connection || null;
  }

  async function getDecryptedAccessToken() {
    const connection = await getPlatformConnection();

    if (!connection?.access_token_encrypted) {
      return null;
    }

    return tokenEncryption.decrypt(connection.access_token_encrypted);
  }

  async function updatePlatformConnection(patch = {}) {
    const existing = await getPlatformConnection();

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

  return {
    savePlatformConnection,
    getPlatformConnection,
    getDecryptedAccessToken,
    updatePlatformConnection,
    toSafePlatformConnection
  };
}

module.exports = {
  createJsonMetaPlatformConnectionRepository,
  STORE_FILE,
  toSafePlatformConnection
};
