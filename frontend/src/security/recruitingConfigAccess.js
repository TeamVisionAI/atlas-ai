/**
 * C2 — Recruiting settings access (UI hints only; backend requireOrgAdmin is authoritative).
 */

import { PERMISSIONS, roleHasPermission, normalizeRole, ROLES } from "./workspacePermissions.js";
import { isSuperAdminUser } from "./isSuperAdminUser.js";

function normalizeSaasRole(user) {
  return String(user?.saasRole || user?.saas_role || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * PATCH /api/organization/recruiting-config requires tenant ADMIN or SUPER_ADMIN.
 * RVP org:write is intentionally insufficient (C1).
 */
export function canEditRecruitingConfig(user) {
  if (!user) {
    return false;
  }

  if (isSuperAdminUser(user)) {
    return true;
  }

  const saasRole = normalizeSaasRole(user);
  if (saasRole === "ADMIN") {
    return true;
  }

  return normalizeRole(user.role) === ROLES.ADMINISTRATOR;
}

export function canAccessRecruitingSettings(user) {
  if (!user) {
    return false;
  }

  if (isSuperAdminUser(user)) {
    return true;
  }

  if (normalizeRole(user.role) !== ROLES.ADMINISTRATOR) {
    return false;
  }

  return roleHasPermission(user.role, PERMISSIONS.ORG_READ);
}
