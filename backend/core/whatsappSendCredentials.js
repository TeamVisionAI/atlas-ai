/**
 * Resolves WhatsApp Cloud API send credentials for production.
 * Prefers org-scoped Embedded Signup connection; falls back to WHATSAPP_* env vars.
 */

const { repository } = require("../repositories/metaWhatsAppConnectionRepository");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { getMetaGraphApiVersion } = require("./meta/metaGraphApiVersion");

function graphApiVersion() {
  return getMetaGraphApiVersion();
}

function envCredentials() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;

  if (!accessToken || !phoneNumberId) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    graphApiVersion: graphApiVersion(),
    source: "environment"
  };
}

/**
 * @param {string|null} [organizationId]
 * @returns {Promise<{ accessToken: string, phoneNumberId: string, graphApiVersion: string, source: string }|null>}
 */
async function resolveWhatsAppSendCredentials(organizationId = null) {
  const orgId = organizationId || process.env.DEFAULT_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID;

  try {
    const connection = await repository.getConnection(orgId);
    const accessToken = await repository.getDecryptedAccessToken(orgId);

    if (accessToken && connection?.phone_number_id && connection.status === "connected") {
      return {
        accessToken,
        phoneNumberId: connection.phone_number_id,
        graphApiVersion: graphApiVersion(),
        source: "embedded_signup",
        wabaId: connection.waba_id || null,
        organizationId: orgId
      };
    }
  } catch (error) {
    logWhatsAppStage("send_credentials_repository_error", {
      level: "error",
      error: error.message,
      organizationId: orgId
    });
  }

  return envCredentials();
}

function describeCredentialSource(credentials) {
  if (!credentials) {
    return "none";
  }

  return credentials.source;
}

module.exports = {
  resolveWhatsAppSendCredentials,
  graphApiVersion,
  describeCredentialSource
};
