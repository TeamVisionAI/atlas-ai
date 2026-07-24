/**
 * Resolves WhatsApp Cloud API send credentials for production.
 * Prefers Embedded Signup stored connection; falls back to WHATSAPP_* env vars.
 */

const { repository } = require("../repositories/metaWhatsAppConnectionRepository");
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
 * @returns {Promise<{ accessToken: string, phoneNumberId: string, graphApiVersion: string, source: string }|null>}
 */
async function resolveWhatsAppSendCredentials() {
  try {
    const connection = await repository.getConnection();
    const accessToken = await repository.getDecryptedAccessToken();

    if (accessToken && connection?.phone_number_id) {
      return {
        accessToken,
        phoneNumberId: connection.phone_number_id,
        graphApiVersion: graphApiVersion(),
        source: "embedded_signup",
        wabaId: connection.waba_id || null
      };
    }
  } catch (error) {
    logWhatsAppStage("send_credentials_repository_error", {
      level: "error",
      error: error.message
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
