import { isSuperAdminUser } from "./isSuperAdminUser.js";

export function isSupportModeActive(supportMode) {
  return Boolean(supportMode?.active && supportMode?.organizationId);
}

export function isGlobalSuperAdminControlPlane(user, supportMode) {
  return isSuperAdminUser(user) && !isSupportModeActive(supportMode);
}
