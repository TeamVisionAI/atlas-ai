/**
 * Canonical organization resolution for WhatsApp Cloud API inbound leads.
 * Prefer WABA/phone configuration; fall back to the single-tenant default only
 * through this resolver (no scattered hardcoding at insert sites).
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { repository } = require("../repositories/metaWhatsAppConnectionRepository");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

class WhatsAppInboundOrganizationError extends Error {
  constructor(message, { code = "WHATSAPP_ORGANIZATION_UNRESOLVED" } = {}) {
    super(message);
    this.name = "WhatsAppInboundOrganizationError";
    this.code = code;
    this.publicCode = code;
    this.statusCode = 503;
  }
}

function canonicalDefaultOrganizationId() {
  return (
    process.env.ATLAS_DEFAULT_ORGANIZATION_ID ||
    process.env.DEFAULT_ORGANIZATION_ID ||
    DEFAULT_ORGANIZATION_ID ||
    null
  );
}

function configuredEnvPhoneNumberId() {
  const value = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  return value || null;
}

function configuredEnvWabaId() {
  const value = String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim();
  return value || null;
}

function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
}

/**
 * @param {object} [input]
 * @param {string|null} [input.phoneNumberId] — Meta value.metadata.phone_number_id
 * @param {string|null} [input.wabaId] — Meta entry.id (WABA)
 * @param {string|null} [input.explicitOrganizationId]
 * @param {{ getConnection?: Function }} [input.connectionRepository]
 * @returns {Promise<{ organizationId: string, source: string }>}
 */
async function resolveWhatsAppInboundOrganizationId(input = {}) {
  const {
    phoneNumberId = null,
    wabaId = null,
    explicitOrganizationId = null,
    connectionRepository = repository
  } = input;

  if (explicitOrganizationId && String(explicitOrganizationId).trim()) {
    return {
      organizationId: String(explicitOrganizationId).trim(),
      source: "explicit"
    };
  }

  const defaultOrganizationId = canonicalDefaultOrganizationId();
  const envPhoneNumberId = configuredEnvPhoneNumberId();
  const envWabaId = configuredEnvWabaId();

  if (phoneNumberId && envPhoneNumberId && !sameId(phoneNumberId, envPhoneNumberId)) {
    throw new WhatsAppInboundOrganizationError(
      "Inbound WhatsApp phone_number_id does not match configured production phone asset.",
      { code: "WHATSAPP_PHONE_ASSET_MISMATCH" }
    );
  }

  if (wabaId && envWabaId && !sameId(wabaId, envWabaId)) {
    throw new WhatsAppInboundOrganizationError(
      "Inbound WhatsApp WABA id does not match configured production WABA asset.",
      { code: "WHATSAPP_WABA_ASSET_MISMATCH" }
    );
  }

  if (defaultOrganizationId && connectionRepository?.getConnection) {
    try {
      const connection = await connectionRepository.getConnection(defaultOrganizationId);
      if (
        connection?.status === "connected" &&
        connection.phone_number_id &&
        (!phoneNumberId || sameId(phoneNumberId, connection.phone_number_id)) &&
        (!wabaId || !connection.waba_id || sameId(wabaId, connection.waba_id))
      ) {
        return {
          organizationId: defaultOrganizationId,
          source: "whatsapp_connection"
        };
      }
    } catch (error) {
      logWhatsAppStage("inbound_organization_connection_lookup_failed", {
        level: "warn",
        error: error.message
      });
    }
  }

  // Single-tenant env credentials: configured phone (and optional WABA) map to canonical default org.
  if (defaultOrganizationId && envPhoneNumberId) {
    if (!phoneNumberId || sameId(phoneNumberId, envPhoneNumberId)) {
      if (!wabaId || !envWabaId || sameId(wabaId, envWabaId)) {
        return {
          organizationId: defaultOrganizationId,
          source: "environment_credentials"
        };
      }
    }
  }

  if (defaultOrganizationId && !phoneNumberId && !wabaId && !envPhoneNumberId) {
    // Dev/test ingress without Cloud API asset ids still needs a tenant.
    return {
      organizationId: defaultOrganizationId,
      source: "canonical_default"
    };
  }

  throw new WhatsAppInboundOrganizationError(
    "Unable to resolve organization for inbound WhatsApp prospect."
  );
}

module.exports = {
  resolveWhatsAppInboundOrganizationId,
  WhatsAppInboundOrganizationError,
  canonicalDefaultOrganizationId
};
