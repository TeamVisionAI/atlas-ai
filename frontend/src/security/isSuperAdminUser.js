/**
 * Super Admin identity for platform UI.
 *
 * Tenant Administrators also map to workspace role `administrator`.
 * Platform surfaces must use saasRole / isSuperAdmin, never workspace type alone.
 */

export function isSuperAdminUser(user) {
  if (!user) {
    return false;
  }

  if (user.isSuperAdmin === true) {
    return true;
  }

  const saasRole = String(user.saasRole || user.saas_role || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (saasRole === "SUPER_ADMIN") {
    return true;
  }

  const role = String(user.role || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  return role === "SUPER_ADMIN";
}
