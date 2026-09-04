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
async function resolveConnectionCredentials(connection, connectionRepository, orgId) {
  if (!connection?.phone_number_id || connection.status !== "connected") {
    return null;
  }

  // Implements BR-147 / BR-165 — decrypt the same integration row that owns
  // phone_number_id. Org-owned getDecryptedAccessToken(orgId) would send a
  // personal Graph request with the Team Vision token (Meta 400, no wamid).
  const ownerUserId = connection.user_id || connection.userId || null;
  const accessToken = await connectionRepository.getDecryptedAccessToken(
    orgId,
    ownerUserId
  );
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId: connection.phone_number_id,
    graphApiVersion: graphApiVersion(),
    source: "embedded_signup",
    wabaId: connection.waba_id || null,
    organizationId: orgId
  };
}

async function resolveWhatsAppSendCredentials(organizationId = null, options = {}) {
  const orgId = organizationId || process.env.DEFAULT_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID;
  const connectionRepository = options.connectionRepository || repository;
  const inboundPhoneNumberId = trimId(options.phoneNumberId);

  // Inbound-authoritative: reply from the connected asset that received the message.
  if (
    inboundPhoneNumberId &&
    typeof connectionRepository.findConnectionByPhoneNumberId === "function"
  ) {
    try {
      const byPhone = await connectionRepository.findConnectionByPhoneNumberId(
        inboundPhoneNumberId
      );
      const resolvedOrgId = byPhone?.organization_id
        ? String(byPhone.organization_id)
        : null;

      if (
        byPhone?.status === "connected" &&
        resolvedOrgId &&
        (!orgId || sameId(resolvedOrgId, orgId))
      ) {
        const routed = await resolveConnectionCredentials(
          byPhone,
          connectionRepository,
          resolvedOrgId
        );
        if (routed) {
          return routed;
        }
      }
    } catch (error) {
      logWhatsAppStage("send_credentials_inbound_phone_lookup_failed", {
        level: "warn",
        phoneNumberId: inboundPhoneNumberId,
        error: error.message,
        organizationId: orgId
      });
    }
  }

  try {
    const connection = await connectionRepository.getConnection(orgId);

    if (isOrgConnectionEligibleForRouting(connection)) {
      const routed = await resolveConnectionCredentials(
        connection,
        connectionRepository,
        orgId
      );
      if (routed) {
        return routed;
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

// Implements BR-228 — fail-closed inbound media fetch. Token must belong to the
// connection that received the media. Never fall back to env / Team Vision token.
async function resolveWhatsAppMediaFetchCredentials({
  organizationId = null,
  phoneNumberId = null,
  connectionRepository = repository
} = {}) {
  const orgId = trimId(organizationId);
  const inboundPhoneNumberId = trimId(phoneNumberId);
  const repo = connectionRepository || repository;
  if (!orgId || !inboundPhoneNumberId) {
    return null;
  }
  if (typeof repo.findConnectionByPhoneNumberId !== "function") {
    return null;
  }

  try {
    const byPhone = await repo.findConnectionByPhoneNumberId(
      inboundPhoneNumberId
    );
    const resolvedOrgId = byPhone?.organization_id
      ? String(byPhone.organization_id)
      : null;
    if (
      byPhone?.status !== "connected" ||
      !resolvedOrgId ||
      !sameId(resolvedOrgId, orgId)
    ) {
      return null;
    }
    return resolveConnectionCredentials(byPhone, repo, resolvedOrgId);
  } catch (error) {
    logWhatsAppStage("media_fetch_credentials_lookup_failed", {
      level: "warn",
      phoneNumberId: inboundPhoneNumberId,
      organizationId: orgId,
      error: error.message
    });
    return null;
  }
}

function describeCredentialSource(credentials) {
  if (!credentials) {
    return "none";
  }

  return credentials.source;
}

module.exports = {
  resolveWhatsAppSendCredentials,
  resolveWhatsAppMediaFetchCredentials,
  graphApiVersion,
  describeCredentialSource,
  isOrgConnectionEligibleForRouting
};
