/**
 * Sprint 6.1 — Meta WhatsApp connection repository facade.
 * Swap implementation here when moving to Supabase (production).
 */

const { createJsonMetaWhatsAppConnectionRepository, STORE_FILE } = require("./jsonMetaWhatsAppConnectionRepository");
const {
  toSafeConnection,
  assertRepositoryImplementation
} = require("./metaConnectionRepositoryInterface");

const repository = createJsonMetaWhatsAppConnectionRepository();

assertRepositoryImplementation(repository);

/** @deprecated Use repository.saveConnection */
async function saveWhatsAppConnection(record) {
  return repository.saveConnection(record);
}

/** @deprecated Use repository.getConnection */
async function getWhatsAppConnection() {
  return repository.getConnection();
}

module.exports = {
  repository,
  saveWhatsAppConnection,
  getWhatsAppConnection,
  toSafeConnection,
  STORE_FILE
};
