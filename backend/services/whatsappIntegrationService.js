/**
 * Sprint 20.1 + BR-147 — WhatsApp integration operations.
 * Personal connections are user-scoped; legacy org channel remains user_id NULL.
 */

const { repository, toSafeConnection } = require("../repositories/metaWhatsAppConnectionRepository");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const { getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { writeAuditLog } = require("../security/auditLogService");
const { metaLogger } = require("../core/meta/metaLogger");
const { hasPermission } = require("../security/authorizationService");
const { PERMISSIONS } = require("../security/permissions");

async function resolveOrganizationId(authContext, req = null) {
  if (req) {
    const effective = getEffectiveOrganizationId(req);
    if (effective) {
      return effective;
    }
  }

  if (authContext?.homeOrganizationId && authContext?.organizationId) {
    return authContext.organizationId;
  }

  return resolveWorkspaceOrganizationId(authContext);
}

function presentIntegrationStatus(connection) {
  const safe = toSafeConnection(connection);

  return {
    connected: Boolean(safe && safe.status === "connected"),
    status: safe?.status || "disconnected",
    connection: safe,
    ownership: safe?.ownership || (connection?.user_id ? "personal" : "organization"),
    storageKind: repository.getStorageKind()
  };
}

async function getIntegrationStatus(authContext, req = null) {
  const organizationId = await resolveOrganizationId(authContext, req);
  return getPersonalIntegrationStatusForOrganization(organizationId, authContext.userId);
}

async function getIntegrationStatusForOrganization(organizationId) {
  const connection = await repository.getConnection(organizationId);
  return presentIntegrationStatus(connection);
}

async function getPersonalIntegrationStatusForOrganization(organizationId, userId) {
  if (!userId || typeof repository.getUserConnection !== "function") {
    return presentIntegrationStatus(null);
  }

  const connection = await repository.getUserConnection(organizationId, userId);
  return presentIntegrationStatus(connection);
}

/**
 * Disconnect personal WhatsApp for the actor, or org legacy when orgWrite + ownership=organization.
 */
async function disconnectIntegration(authContext, auditMeta = {}, req = null, options = {}) {
  const organizationId = await resolveOrganizationId(authContext, req);
  const ownership =
    options.ownership === "organization" || options.ownershipMode === "organization"
      ? "organization"
      : "personal";

  if (ownership === "organization") {
    if (!hasPermission(authContext, PERMISSIONS.ORG_WRITE)) {
      const error = new Error("Organization WhatsApp disconnect requires org:write.");
      error.statusCode = 403;
      error.publicCode = "WHATSAPP_ORG_DISCONNECT_FORBIDDEN";
      throw error;
    }

    const existing = await repository.getConnection(organizationId);
    if (!existing) {
      const error = new Error("No organization WhatsApp integration found.");
      error.statusCode = 404;
      error.publicCode = "WHATSAPP_NOT_CONNECTED";
      throw error;
    }

    const updated = await repository.disconnectConnection(organizationId);
    await writeAuditLog({
      organizationId,
      userId: authContext.userId,
      userEmail: authContext.email,
      action: "whatsapp.organization_integration_disconnected",
      targetType: "whatsapp_integration",
      targetId: organizationId,
      ipAddress: auditMeta.ipAddress,
      userAgent: auditMeta.userAgent
    });
    metaLogger.info("whatsapp_organization_integration_disconnected", { organizationId });
    return { success: true, ownership, connection: toSafeConnection(updated) };
  }

  const existing = await repository.getUserConnection(organizationId, authContext.userId);
  if (!existing) {
    const error = new Error("No personal WhatsApp integration found for this user.");
    error.statusCode = 404;
    error.publicCode = "WHATSAPP_NOT_CONNECTED";
    throw error;
  }

  const updated = await repository.disconnectConnection(organizationId, authContext.userId);

  await writeAuditLog({
    organizationId,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "whatsapp.personal_integration_disconnected",
    targetType: "whatsapp_integration",
    targetId: existing.id || organizationId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  metaLogger.info("whatsapp_personal_integration_disconnected", {
    organizationId,
    userId: authContext.userId
  });

  return {
    success: true,
    ownership: "personal",
    connection: toSafeConnection(updated)
  };
}

/**
 * BR-193 — explicit Meta Ad Destination automation toggle. Default remains false.
 */
async function updateMetaAdDestinationAutomation(
  authContext,
  { enabled, ownership = "personal" } = {},
  req = null,
  auditMeta = {}
) {
  const organizationId = await resolveOrganizationId(authContext, req);
  const isOrganization =
    ownership === "organization" || ownership === "organizationChannel";

  if (isOrganization) {
    if (!hasPermission(authContext, PERMISSIONS.ORG_WRITE)) {
      const error = new Error("Organization WhatsApp settings require org:write.");
      error.statusCode = 403;
      error.publicCode = "WHATSAPP_ORG_SETTINGS_FORBIDDEN";
      throw error;
    }
  } else if (!hasPermission(authContext, PERMISSIONS.INTEGRATIONS_SELF)) {
    const error = new Error("Personal WhatsApp settings require integrations:self.");
    error.statusCode = 403;
    error.publicCode = "WHATSAPP_PERSONAL_SETTINGS_FORBIDDEN";
    throw error;
  }

  const flag = enabled === true;
  const patch = {
    meta_ad_destination_automation_enabled: flag,
    ...(isOrganization ? {} : { user_id: authContext.userId })
  };

  const updated = await repository.updateConnection(organizationId, patch);
  if (!updated) {
    const error = new Error(
      isOrganization
        ? "No organization WhatsApp integration found."
        : "No personal WhatsApp integration found for this user."
    );
    error.statusCode = 404;
    error.publicCode = "WHATSAPP_NOT_CONNECTED";
    throw error;
  }

  await writeAuditLog({
    organizationId,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: isOrganization
      ? "whatsapp.organization_ad_destination_updated"
      : "whatsapp.personal_ad_destination_updated",
    targetType: "whatsapp_integration",
    targetId: updated.id || organizationId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent,
    metadata: { metaAdDestinationAutomationEnabled: flag }
  });

  metaLogger.info("whatsapp_ad_destination_updated", {
    organizationId,
    userId: authContext.userId || null,
    ownership: isOrganization ? "organization" : "personal",
    metaAdDestinationAutomationEnabled: flag
  });

  return {
    success: true,
    ownership: isOrganization ? "organization" : "personal",
    connection: toSafeConnection(updated)
  };
}

module.exports = {
  resolveOrganizationId,
  getIntegrationStatus,
  getIntegrationStatusForOrganization,
  getPersonalIntegrationStatusForOrganization,
  disconnectIntegration,
  updateMetaAdDestinationAutomation,
  presentIntegrationStatus
};
