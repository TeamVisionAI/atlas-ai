/**
 * Sprint 20.1 — WhatsApp integration repository facade.
 * Uses Supabase when service role is configured; JSON file fallback for local dev.
 */

const {
  createJsonMetaWhatsAppConnectionRepository,
  STORE_FILE
} = require("./jsonMetaWhatsAppConnectionRepository");
const {
  createSupabaseWhatsAppIntegrationRepository
} = require("./supabaseWhatsAppIntegrationRepository");
const {
  toSafeConnection,
  assertRepositoryImplementation
} = require("./metaConnectionRepositoryInterface");

function createWhatsAppIntegrationRepository() {
  if (process.env.WHATSAPP_REPOSITORY === "json") {
    return createJsonMetaWhatsAppConnectionRepository();
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseWhatsAppIntegrationRepository();
  }

  return createJsonMetaWhatsAppConnectionRepository();
}

const repository = createWhatsAppIntegrationRepository();

assertRepositoryImplementation(repository);

async function saveWhatsAppConnection(organizationId, record) {
  return repository.saveConnection(organizationId, record);
}

async function getWhatsAppConnection(organizationId) {
  return repository.getConnection(organizationId);
}

module.exports = {
  repository,
  saveWhatsAppConnection,
  getWhatsAppConnection,
  toSafeConnection,
  STORE_FILE
};
