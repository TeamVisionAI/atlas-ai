const { getOfficeLocation } = require("./businessRulesEngine");

function normalizeUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function buildMapsUrl(fullAddress) {
  if (!fullAddress) {
    return null;
  }

  return `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;
}

/**
 * Organization-wide settings for Mission Control and agent actions.
 * Extend this object as new settings are added (business hours, templates, etc.).
 */
function resolveOrganizationDisplayName(office = getOfficeLocation()) {
  const name = String(office?.name || "").trim();

  if (!name) {
    return "Atlas";
  }

  return name.replace(/\s+office$/i, "").trim() || name;
}

function getOrganizationSettings() {
  const office = getOfficeLocation();

  // Implements BR-079 — organization business timezone (optional override).
  // When unset, organizationDateWindow falls through to appointment profile / Atlas default.
  const timezone =
    typeof process.env.ATLAS_ORGANIZATION_TIMEZONE === "string" &&
    process.env.ATLAS_ORGANIZATION_TIMEZONE.trim()
      ? process.env.ATLAS_ORGANIZATION_TIMEZONE.trim()
      : null;

  return {
    organizationName: resolveOrganizationDisplayName(office),
    timezone,
    office: {
      name: office.name,
      street: office.street,
      suite: office.suite,
      city: office.city,
      state: office.state,
      zip: office.zip,
      fullAddress: office.fullAddress,
      mapsUrl: buildMapsUrl(office.fullAddress)
    },
    businessHours: null,
    templates: {},
    // Optional override for BR-191 reminder cadence. Null = global 24h / 1h / 30m.
    appointmentReminderOffsetsMinutes: null
  };
}

module.exports = {
  getOrganizationSettings,
  resolveOrganizationDisplayName
};
