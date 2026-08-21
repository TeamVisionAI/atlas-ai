/**
 * Sprint 20.1 — Organization-scoped WhatsApp integration operations.
 * Persist/status/disconnect MUST use effective tenant (Support Mode), not home org.
 */

const { repository, toSafeConnection } = require("../repositories/metaWhatsAppConnectionRepository");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const { getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { writeAuditLog } = require("../security/auditLogService");
const { metaLogger } = require("../core/meta/metaLogger");

/**
 * Resolve org for WhatsApp integration mutations/reads.
 * Prefers request effective tenant (Support Mode) over atlas_users home org.
 */
async function resolveOrganizationId(authContext, req = null) {
  if (req) {
    const effective = getEffectiveOrganizationId(req);
    if (effective) {
      return effective;
    }
  }

  // organizationGuard rebinds authContext.organizationId and stamps homeOrganizationId
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
    storageKind: repository.getStorageKind()
  };
}

async function getIntegrationStatus(authContext, req = null) {
  const organizationId = await resolveOrganizationId(authContext, req);
  return getIntegrationStatusForOrganization(organizationId);
}

async function getIntegrationStatusForOrganization(organizationId) {
  const connection = await repository.getConnection(organizationId);
  return presentIntegrationStatus(connection);
}

async function disconnectIntegration(authContext, auditMeta = {}, req = null) {
  const organizationId = await resolveOrganizationId(authContext, req);
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
