/**
 * Sprint 6.1 — Repository contract for Meta WhatsApp connection storage.
 *
 * Implementations must encrypt access tokens at rest via tokenEncryption abstraction.
 * Production target: Supabase-backed implementation implementing the same interface.
 *
 * @typedef {Object} MetaWhatsAppConnectionRecord
 * @property {string} waba_id
 * @property {string} phone_number_id
 * @property {string} connection_type
 * @property {string} status
 * @property {string} access_token_encrypted
 * @property {string|null} display_phone_number
 * @property {string|null} verified_name
 * @property {string|null} last_health_status
 * @property {string|null} last_health_checked_at
 * @property {string} created_at
 * @property {string} updated_at
 *
 * @typedef {Object} MetaWhatsAppConnectionRepository
 * @property {(record: Object) => Promise<MetaWhatsAppConnectionRecord>} saveConnection
 * @property {() => Promise<MetaWhatsAppConnectionRecord|null>} getConnection
 * @property {() => Promise<string|null>} getDecryptedAccessToken
 * @property {(patch: Object) => Promise<MetaWhatsAppConnectionRecord|null>} updateConnection
 * @property {() => string} getStorageKind
 */

function toSafeConnection(connection) {
  if (!connection) {
    return null;
  }

  return {
    wabaId: connection.waba_id,
    phoneNumberId: connection.phone_number_id,
    connectionType: connection.connection_type,
    status: connection.status,
    displayPhoneNumber: connection.display_phone_number || null,
    verifiedName: connection.verified_name || null,
    healthStatus: connection.last_health_status || null,
    healthCheckedAt: connection.last_health_checked_at || null,
    connectedAt: connection.created_at,
    updatedAt: connection.updated_at
  };
}

function assertRepositoryImplementation(repository) {
  const required = ["saveConnection", "getConnection", "getDecryptedAccessToken", "updateConnection"];

  for (const method of required) {
    if (typeof repository[method] !== "function") {
      throw new Error(`MetaWhatsAppConnectionRepository missing method: ${method}`);
    }
  }

  return repository;
}

module.exports = {
  toSafeConnection,
  assertRepositoryImplementation
};
