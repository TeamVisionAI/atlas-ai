/**
 * Tenant billing settings access (UI). Backend billing:access is authoritative.
 */

import { PERMISSIONS, roleHasPermission, normalizeRole, ROLES } from "./workspacePermissions.js";
import { isSuperAdminUser } from "./isSuperAdminUser.js";

export function canAccessBillingSettings(user) {
  if (!user) {
    return false;
  }

  if (isSuperAdminUser(user)) {
    return true;
  }

  if (normalizeRole(user.role) !== ROLES.ADMINISTRATOR) {
    return false;
  }

  return roleHasPermission(user.role, PERMISSIONS.BILLING_ACCESS);
}

/** Tenant Settings → Billing is read-only for all tenant users. */
export function canEditTenantBillingPage() {
  return false;
}
