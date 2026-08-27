/**
 * BR-161 — Feature flag for Apple/iCloud personal availability overlay.
 * Default off. Production canary uses org/user allowlists.
 */

const FLAG_ENV = "ATLAS_ICLOUD_CALENDAR_AVAILABILITY_ENABLED";
const ORG_ALLOWLIST_ENV = "ATLAS_ICLOUD_CALENDAR_AVAILABILITY_ORGANIZATION_IDS";
const USER_ALLOWLIST_ENV = "ATLAS_ICLOUD_CALENDAR_AVAILABILITY_USER_IDS";

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseIdList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isIcloudAvailabilityEnabled({
  organizationId = null,
  userId = null,
  env = process.env
} = {}) {
  if (!parseBoolean(env[FLAG_ENV])) {
    return false;
  }

  const orgAllowlist = parseIdList(env[ORG_ALLOWLIST_ENV]);
  const userAllowlist = parseIdList(env[USER_ALLOWLIST_ENV]);

  if (orgAllowlist.length > 0) {
    if (!organizationId || !orgAllowlist.includes(String(organizationId))) {
      return false;
    }
  }

  if (userAllowlist.length > 0) {
    if (!userId || !userAllowlist.includes(String(userId))) {
      return false;
    }
  }

  return true;
}

module.exports = {
  FLAG_ENV,
  ORG_ALLOWLIST_ENV,
  USER_ALLOWLIST_ENV,
  isIcloudAvailabilityEnabled
};
