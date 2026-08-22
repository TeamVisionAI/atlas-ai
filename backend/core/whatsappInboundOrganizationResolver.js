/**
 * Canonical organization (+ optional owning user) resolution for WhatsApp inbound.
 * Preferred: connected phone_number_id → organization_id + user_id (BR-147).
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

function defaultConnectionRepository() {
  return require("../repositories/metaWhatsAppConnectionRepository").repository;
}

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
 * @returns {Promise<{ organizationId: string, source: string, ownerUserId: string|null }>}
 */
async function resolveWhatsAppInboundOrganizationId(input = {}) {
  const {
    phoneNumberId = null,
    wabaId = null,
    explicitOrganizationId = null,
    connectionRepository = defaultConnectionRepository()
  } = input;

  if (explicitOrganizationId && String(explicitOrganizationId).trim()) {
    return {
      organizationId: String(explicitOrganizationId).trim(),
      ownerUserId: null,
      source: "explicit"
    };
  }

  const defaultOrganizationId = canonicalDefaultOrganizationId();
  const envPhoneNumberId = configuredEnvPhoneNumberId();
  const envWabaId = configuredEnvWabaId();

  // 1) Preferred: Phone Number ID → connected whatsapp_integrations row (org + owner)
  if (phoneNumberId && typeof connectionRepository.findConnectionByPhoneNumberId === "function") {
    try {
      const byPhone = await connectionRepository.findConnectionByPhoneNumberId(phoneNumberId);
      if (byPhone?.organization_id && byPhone.status === "connected") {
        if (wabaId && byPhone.waba_id && !sameId(wabaId, byPhone.waba_id)) {
          throw new WhatsAppInboundOrganizationError(
            "Inbound WhatsApp WABA id does not match connected phone asset.",
            { code: "WHATSAPP_WABA_ASSET_MISMATCH" }
          );
        }

        return {
          organizationId: String(byPhone.organization_id),
          ownerUserId: byPhone.user_id ? String(byPhone.user_id) : null,
          source: byPhone.user_id
            ? "whatsapp_personal_connection"
            : "whatsapp_organization_connection"
        };
      }
    } catch (error) {
      if (error instanceof WhatsAppInboundOrganizationError) {
        throw error;
      }
      if (error?.publicCode === "WHATSAPP_PHONE_ID_AMBIGUOUS") {
        throw error;
      }
      logWhatsAppStage("inbound_organization_phone_lookup_failed", {
        level: "warn",
        error: error.message
      });
    }
  }

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

  // 2) Legacy: default-org organization-owned connection
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
          ownerUserId: connection.user_id ? String(connection.user_id) : null,
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

  if (defaultOrganizationId && envPhoneNumberId) {
    if (!phoneNumberId || sameId(phoneNumberId, envPhoneNumberId)) {
      if (!wabaId || !envWabaId || sameId(wabaId, envWabaId)) {
        return {
          organizationId: defaultOrganizationId,
          ownerUserId: null,
          source: "environment_credentials"
        };
      }
    }
  }

  if (defaultOrganizationId && !phoneNumberId && !wabaId && !envPhoneNumberId) {
    return {
      organizationId: defaultOrganizationId,
      ownerUserId: null,
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
