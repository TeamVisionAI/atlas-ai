/**
 * BR-193 — Meta Ad Destination fallback when Meta omits CTWA metadata.
 * Explicit per-connection setting only. Never infer from greeting text or from_user_id.
 */

const AD_DESTINATION_FALLBACK_REASON = "AD_DESTINATION_FALLBACK_NO_CTWA_METADATA";
const META_AD_DESTINATION_ELIGIBILITY_SOURCE = "META_AD_DESTINATION";

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function trimId(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function isExplicitlyEnabled(connection) {
  return (
    connection?.metaAdDestinationAutomationEnabled === true ||
    connection?.meta_ad_destination_automation_enabled === true
  );
}

function buildWhatsAppConnectionEligibilityContext(connection) {
  if (!connection || typeof connection !== "object") {
    return null;
  }

  return {
    status: connection.status || null,
    phoneNumberId: trimId(connection.phoneNumberId || connection.phone_number_id),
    organizationId: trimId(connection.organizationId || connection.organization_id),
    ownerUserId: trimId(
      connection.ownerUserId || connection.user_id || connection.userId
    ),
    metaAdDestinationAutomationEnabled: isExplicitlyEnabled(connection)
  };
}

/**
 * @returns {{
 *   eligible: boolean,
 *   reason: string,
 *   ownerUserId?: string,
 *   organizationId?: string
 * }}
 */
function evaluateMetaAdDestinationFallback({
  inbound = null,
  whatsappConnection = null,
  inboundPhoneNumberId = null,
  expectedOrganizationId = null
} = {}) {
  const connection = buildWhatsAppConnectionEligibilityContext(
    whatsappConnection || inbound?.whatsappConnection || null
  );
  if (!connection) {
    return { eligible: false, reason: "NO_AD_DESTINATION_CONNECTION" };
  }

  if (connection.metaAdDestinationAutomationEnabled !== true) {
    return { eligible: false, reason: "AD_DESTINATION_DISABLED" };
  }

  if (String(connection.status || "").trim().toLowerCase() !== "connected") {
    return { eligible: false, reason: "AD_DESTINATION_NOT_CONNECTED" };
  }

  const inboundPhone = trimId(
    inboundPhoneNumberId ||
      inbound?.phoneNumberId ||
      inbound?.phone_number_id ||
      null
  );
  if (!inboundPhone || !connection.phoneNumberId || !sameId(inboundPhone, connection.phoneNumberId)) {
    return { eligible: false, reason: "AD_DESTINATION_PHONE_MISMATCH" };
  }

  if (!connection.ownerUserId) {
    return { eligible: false, reason: "AD_DESTINATION_OWNER_UNRESOLVED" };
  }

  if (!connection.organizationId) {
    return { eligible: false, reason: "AD_DESTINATION_ORG_UNRESOLVED" };
  }

  const expectedOrg = trimId(
    expectedOrganizationId || inbound?.organizationId || inbound?.organization_id || null
  );
  if (expectedOrg && !sameId(expectedOrg, connection.organizationId)) {
    return { eligible: false, reason: "AD_DESTINATION_TENANT_MISMATCH" };
  }

  return {
    eligible: true,
    reason: AD_DESTINATION_FALLBACK_REASON,
    ownerUserId: connection.ownerUserId,
    organizationId: connection.organizationId
  };
}

function isMetaAdDestinationFallbackEligible(input = {}) {
  return evaluateMetaAdDestinationFallback(input).eligible === true;
}

module.exports = {
  AD_DESTINATION_FALLBACK_REASON,
  META_AD_DESTINATION_ELIGIBILITY_SOURCE,
  buildWhatsAppConnectionEligibilityContext,
  evaluateMetaAdDestinationFallback,
  isMetaAdDestinationFallbackEligible
};
