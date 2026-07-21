/**
 * Release 1.2 — Organization profile model.
 */

const crypto = require("crypto");

/**
 * @param {Object} input
 * @returns {Object}
 */
function createOrganizationProfile(input = {}) {
  if (!input.name) {
    throw new Error("Organization profile requires name");
  }

  return {
    id: input.id || crypto.randomUUID(),
    name: input.name,
    legalName: input.legalName || null,
    description: input.description || null,
    website: input.website || null,
    primaryLanguage: input.primaryLanguage || null,
    supportedLanguages: Array.isArray(input.supportedLanguages) ? input.supportedLanguages : [],
    timeZone: input.timeZone || null,
    dateFormat: input.dateFormat || null,
    phone: input.phone || null,
    email: input.email || null,
    businessType: input.businessType || null,
    status: input.status || "active",
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

function updateOrganizationProfile(profile, patch = {}) {
  return {
    ...profile,
    ...patch,
    supportedLanguages: patch.supportedLanguages || profile.supportedLanguages,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  createOrganizationProfile,
  updateOrganizationProfile
};
