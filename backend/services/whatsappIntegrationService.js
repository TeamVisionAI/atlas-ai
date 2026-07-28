/**
 * Sprint 20.1 — Organization-scoped WhatsApp integration operations.
 */

const { repository, toSafeConnection } = require("../repositories/metaWhatsAppConnectionRepository");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const { writeAuditLog } = require("../security/auditLogService");
const { metaLogger } = require("../core/meta/metaLogger");

async function resolveOrganizationId(authContext) {
  return resolveWorkspaceOrganizationId(authContext);
}

function presentIntegrationStatus(connection) {
  const safe = toSafeConnection(connection);

  return {
    connected: Boolean(safe && safe.status === "connected"),
    status: safe?.status || "disconnected",
    connection: safe,
    storageKind: repository.getStorageKind()
  };
}

async function getIntegrationStatus(authContext) {
  const organizationId = await resolveOrganizationId(authContext);
  return getIntegrationStatusForOrganization(organizationId);
}

async function getIntegrationStatusForOrganization(organizationId) {
  const connection = await repository.getConnection(organizationId);
  return presentIntegrationStatus(connection);
}

async function disconnectIntegration(authContext, auditMeta = {}) {
  const organizationId = await resolveOrganizationId(authContext);
  const existing = await repository.getConnection(organizationId);

  if (!existing) {
    const error = new Error("No WhatsApp integration found for this organization.");
    error.statusCode = 404;
    error.publicCode = "WHATSAPP_NOT_CONNECTED";
    throw error;
  }

  const updated = await repository.disconnectConnection(organizationId);

  await writeAuditLog({
    organizationId,
    userId: authContext.userId,
    userEmail: authContext.email,
    action: "whatsapp.integration_disconnected",
    targetType: "whatsapp_integration",
    targetId: organizationId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  metaLogger.info("whatsapp_integration_disconnected", { organizationId });

  return {
    success: true,
    connection: toSafeConnection(updated)
  };
}

module.exports = {
  resolveOrganizationId,
  getIntegrationStatus,
  getIntegrationStatusForOrganization,
  disconnectIntegration,
  presentIntegrationStatus
};
