/**
 * Resolves WhatsApp Cloud API send credentials for production.
 * Org-scoped Embedded Signup is used only when it matches the active env phone
 * (and WABA, when both are set). Otherwise env WHATSAPP_* credentials are used.
 * Saved whatsapp_integrations rows are never modified here.
 */

const { repository } = require("../repositories/metaWhatsAppConnectionRepository");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { getMetaGraphApiVersion } = require("./meta/metaGraphApiVersion");

function graphApiVersion() {
  return getMetaGraphApiVersion();
}

function trimId(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function envCredentials() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null;
  const phoneNumberId = trimId(process.env.WHATSAPP_PHONE_NUMBER_ID);

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

function isOrgConnectionEligibleForRouting(connection) {
  if (!connection || connection.status !== "connected") {
    return false;
  }

  const connectionPhone = trimId(connection.phone_number_id);
  const envPhone = trimId(process.env.WHATSAPP_PHONE_NUMBER_ID);

  if (!envPhone || !connectionPhone || !sameId(connectionPhone, envPhone)) {
    return false;
  }

  const connectionWaba = trimId(connection.waba_id);
  const envWaba = trimId(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);

  if (envWaba && connectionWaba && !sameId(connectionWaba, envWaba)) {
    return false;
  }

  return true;
}

/**
 * @param {string|null} [organizationId]
 * @param {{ connectionRepository?: object }} [options]
 * @returns {Promise<{ accessToken: string, phoneNumberId: string, graphApiVersion: string, source: string }|null>}
 */
async function resolveWhatsAppSendCredentials(organizationId = null, options = {}) {
  const orgId = organizationId || process.env.DEFAULT_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID;
  const connectionRepository = options.connectionRepository || repository;

  try {
    const connection = await connectionRepository.getConnection(orgId);

    if (isOrgConnectionEligibleForRouting(connection)) {
      const accessToken = await connectionRepository.getDecryptedAccessToken(orgId);

      if (accessToken && connection.phone_number_id) {
        return {
          accessToken,
          phoneNumberId: connection.phone_number_id,
          graphApiVersion: graphApiVersion(),
          source: "embedded_signup",
          wabaId: connection.waba_id || null,
          organizationId: orgId
        };
      }
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
  describeCredentialSource,
  isOrgConnectionEligibleForRouting
};
