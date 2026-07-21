/**
 * Release 1.2 — Organization branding configuration.
 */

const crypto = require("crypto");

function createBranding(input = {}) {
  return {
    logoUrl: input.logoUrl || null,
    primaryColor: input.primaryColor || null,
    secondaryColor: input.secondaryColor || null,
    accentColor: input.accentColor || null,
    backgroundColor: input.backgroundColor || null,
    typography: input.typography || null,
    emailSignature: input.emailSignature || null,
    footer: input.footer || null,
    socialLinks: input.socialLinks || {}
  };
}

function updateBranding(current, patch = {}) {
  return {
    ...current,
    ...patch,
    socialLinks: {
      ...(current?.socialLinks || {}),
      ...(patch.socialLinks || {})
    }
  };
}

function brandingForPackage(branding) {
  return {
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    accentColor: branding.accentColor,
    backgroundColor: branding.backgroundColor,
    typography: branding.typography,
    emailSignature: branding.emailSignature,
    footer: branding.footer,
    socialLinks: branding.socialLinks
  };
}

module.exports = {
  createBranding,
  updateBranding,
  brandingForPackage
};
