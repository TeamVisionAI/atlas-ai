/**
 * Sprint 20.1 — Repository contract for org-scoped WhatsApp integration storage.
 */

function toSafeConnection(connection) {
  if (!connection) {
    return null;
  }

  return {
    organizationId: connection.organization_id || null,
    userId: connection.user_id || null,
    ownership: connection.user_id ? "personal" : "organization",
    businessId: connection.business_id || null,
    wabaId: connection.waba_id,
    phoneNumberId: connection.phone_number_id,
    connectionType: connection.connection_type,
    status: connection.status,
    displayPhoneNumber: connection.display_phone_number || null,
    businessName: connection.business_name || connection.verified_name || null,
    verifiedName: connection.verified_name || connection.business_name || null,
    healthStatus: connection.last_health_status || null,
    healthCheckedAt: connection.last_health_checked_at || null,
    connectedAt: connection.connected_at || connection.created_at || null,
    lastSyncAt: connection.last_sync_at || connection.updated_at || null,
    updatedAt: connection.updated_at || null,
    metaAdDestinationAutomationEnabled:
      connection.metaAdDestinationAutomationEnabled === true ||
      connection.meta_ad_destination_automation_enabled === true
  };
}

function assertRepositoryImplementation(repository) {
  const required = [
    "saveConnection",
    "getConnection",
    "getDecryptedAccessToken",
    "updateConnection",
    "disconnectConnection",
    "getStorageKind"
  ];

  for (const method of required) {
    if (typeof repository[method] !== "function") {
      throw new Error(`WhatsAppIntegrationRepository missing method: ${method}`);
    }
  }

  return repository;
}

module.exports = {
  toSafeConnection,
  assertRepositoryImplementation
};
