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
function getOrganizationSettings() {
  const office = getOfficeLocation();

  return {
    zoomInterviewUrl: normalizeUrl(process.env.TEAM_VISION_ZOOM_INTERVIEW_URL),
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
    templates: {}
  };
}

module.exports = {
  getOrganizationSettings
};
