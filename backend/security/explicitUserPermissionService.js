/**
 * Explicit user-permission resolver (no role/admin wildcards).
 * BR-074 securities:verify and BR-218 conversations:support only.
 */

const { supabase } = require("../services/supabaseService");
const { SECURITIES_VERIFY_PERMISSION } = require("./securitiesAccessConstants");
const { PERMISSIONS } = require("./permissions");

const EXPLICIT_ONLY_PERMISSIONS = Object.freeze(
  new Set([SECURITIES_VERIFY_PERMISSION, PERMISSIONS.CONVERSATIONS_SUPPORT])
);

/**
 * Evaluate only organization-scoped user_permissions rows.
 * Does not consult role_permissions, hasPermission, or administrator wildcards.
 *
 * @param {{ organizationId: string, userId: string, permissionCode: string, now?: Date }} args
 * @returns {Promise<boolean>}
 */
async function hasExplicitUserPermission({
  organizationId,
  userId,
  permissionCode,
  now = new Date(),
  loadUserPermissions = defaultLoadUserPermissions,
  loadUserOrganizationId = defaultLoadUserOrganizationId
} = {}) {
  if (!organizationId || !userId || !permissionCode) {
    return false;
  }

  if (!EXPLICIT_ONLY_PERMISSIONS.has(permissionCode)) {
    return false;
  }

  const actorOrgId = await loadUserOrganizationId(userId);

  if (!actorOrgId || String(actorOrgId) !== String(organizationId)) {
    return false;
  }

  const rows = await loadUserPermissions(userId, permissionCode);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

  let hasGrant = false;
  let hasDeny = false;

  for (const row of rows || []) {
    if (row.expires_at && Date.parse(row.expires_at) < nowMs) {
      continue;
    }

    if (row.granted === false) {
      hasDeny = true;
    } else if (row.granted === true) {
      hasGrant = true;
    }
  }

  if (hasDeny) {
    return false;
  }

  return hasGrant === true;
}

async function defaultLoadUserOrganizationId(userId) {
  const { data, error } = await supabase
    .from("atlas_users")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return null;
    }
    throw error;
  }

  return data?.organization_id || null;
}

async function defaultLoadUserPermissions(userId, permissionCode) {
  const { data, error } = await supabase
    .from("user_permissions")
    .select("permission_code, granted, expires_at")
    .eq("user_id", userId)
    .eq("permission_code", permissionCode);

  if (error) {
    if (error.code === "42P01") {
      return [];
    }
    throw error;
  }

  return data || [];
}

module.exports = {
  hasExplicitUserPermission,
  SECURITIES_VERIFY_PERMISSION
};
