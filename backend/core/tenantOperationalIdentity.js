/**
 * Tenant-scoped operational identity for reminders, office, and branding.
 * Implements BR-146 — never substitute Team Vision seed values for another tenant.
 */

const { isTeamVisionSeedTenant } = require("./teamVisionSeedTenant");
const { getOrganizationSettings } = require("./organizationSettingsEngine");

const NEUTRAL_ATLAS_DISPLAY_NAME = "Atlas";

function emptyOffice() {
  return {
    name: null,
    street: null,
    suite: null,
    city: null,
    state: null,
    zip: null,
    fullAddress: null,
    mapsUrl: null
  };
}

function resolveTenantDisplayName({
  organizationId = null,
  brandingName = null,
  metadataName = null
} = {}) {
  const branded = String(brandingName || metadataName || "").trim();
  if (branded) {
    return branded;
  }
  if (isTeamVisionSeedTenant(organizationId)) {
    return "Team Vision";
  }
  return NEUTRAL_ATLAS_DISPLAY_NAME;
}

async function loadTenantOperationalIdentity(organizationId, deps = {}) {
  const orgId = String(organizationId || "").trim() || null;
  if (!orgId) {
    return {
      organizationId: null,
      displayName: NEUTRAL_ATLAS_DISPLAY_NAME,
      handoffDisplayName: NEUTRAL_ATLAS_DISPLAY_NAME,
      organizationName: NEUTRAL_ATLAS_DISPLAY_NAME,
      timezone: null,
      office: emptyOffice()
    };
  }

  let branding = null;
  if (typeof deps.getOrganizationBranding === "function") {
    branding = await deps.getOrganizationBranding(orgId);
  } else {
    try {
      branding = await require("../services/organizationBrandingService").getOrganizationBranding(
        orgId
      );
    } catch {
      branding = null;
    }
  }

  const displayName = resolveTenantDisplayName({
    organizationId: orgId,
    brandingName: branding?.name
  });

  let office = emptyOffice();
  const getMeetingManagement =
    deps.getMeetingManagement ||
    require("../services/meetingManagementService").getMeetingManagement;
  try {
    const meetingManagement = await getMeetingManagement(orgId);
    if (meetingManagement?.officeAddress) {
      office = {
        ...emptyOffice(),
        name: displayName,
        fullAddress: String(meetingManagement.officeAddress).trim()
      };
    }
  } catch {
    office = emptyOffice();
  }

  if (!office.fullAddress && isTeamVisionSeedTenant(orgId)) {
    const seed = getOrganizationSettings();
    return {
      organizationId: orgId,
      displayName: displayName || seed.organizationName,
      handoffDisplayName: displayName || seed.organizationName,
      organizationName: displayName || seed.organizationName,
      timezone: branding?.timezone || seed.timezone || null,
      office: seed.office
    };
  }

  return {
    organizationId: orgId,
    displayName,
    handoffDisplayName: displayName,
    organizationName: displayName,
    timezone: branding?.timezone || null,
    office
  };
}

function presentOrganizationSettingsFromIdentity(identity, organizationId) {
  if (isTeamVisionSeedTenant(organizationId)) {
    return getOrganizationSettings();
  }

  return {
    organizationName: identity?.organizationName || NEUTRAL_ATLAS_DISPLAY_NAME,
    timezone: identity?.timezone || null,
    office: identity?.office || emptyOffice(),
    businessHours: null,
    templates: {}
  };
}

module.exports = {
  NEUTRAL_ATLAS_DISPLAY_NAME,
  emptyOffice,
  resolveTenantDisplayName,
  loadTenantOperationalIdentity,
  presentOrganizationSettingsFromIdentity
};
