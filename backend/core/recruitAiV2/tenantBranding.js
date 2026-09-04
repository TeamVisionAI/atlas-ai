/**
 * Recruit AI v2 — tenant-aware customer handoff branding (BR-224).
 * Team Vision may say Team Vision. Other tenants never fall back to that name.
 */

const { isTeamVisionSeedTenant } = require("../teamVisionSeedTenant");
const { NEUTRAL_ATLAS_DISPLAY_NAME } = require("../tenantOperationalIdentity");

const MAX_SAFE_NAME = 80;

function isSafeOrganizationDisplayName(name, organizationId) {
  const n = String(name || "").trim();
  if (!n || n.length > MAX_SAFE_NAME) {
    return false;
  }
  if (n.toLowerCase() === NEUTRAL_ATLAS_DISPLAY_NAME.toLowerCase()) {
    return false;
  }
  if (/[<>{}]/.test(n) || /https?:\/\//i.test(n)) {
    return false;
  }
  if (isTeamVisionSeedTenant(organizationId)) {
    return true;
  }
  return !/team\s*vision/i.test(n);
}

function resolveTeamMemberPhrase({
  organizationId = null,
  organizationName = null,
  language = "english"
} = {}) {
  const spanish = language === "spanish" || language === "es";
  if (isTeamVisionSeedTenant(organizationId)) {
    return spanish
      ? "un compañero de Team Vision"
      : "a Team Vision teammate";
  }
  if (isSafeOrganizationDisplayName(organizationName, organizationId)) {
    const name = String(organizationName).trim();
    return spanish ? `un miembro de ${name}` : `a member of ${name}`;
  }
  return spanish
    ? "un miembro de nuestro equipo"
    : "a member of our team";
}

function capitalizePhrase(phrase) {
  const t = String(phrase || "");
  if (!t) {
    return t;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

module.exports = {
  isSafeOrganizationDisplayName,
  resolveTeamMemberPhrase,
  capitalizePhrase
};
