/**
 * Authenticated shell brand: tenant name in tenant context, Atlas on control plane.
 * Uses organization branding / Support Mode tenant name. No tenant hardcoding.
 */

import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane.js";

export function resolveAuthenticatedShellBrand({
  user,
  supportMode,
  branding,
  atlasLabel = "Atlas"
} = {}) {
  if (isGlobalSuperAdminControlPlane(user, supportMode)) {
    return {
      controlPlane: true,
      name: String(atlasLabel || "Atlas").trim() || "Atlas"
    };
  }

  const fromBranding =
    branding && branding.controlPlane !== true
      ? String(branding.name || branding.organizationName || "").trim()
      : "";
  const fromSupport = String(supportMode?.organizationName || "").trim();
  const name = fromBranding || fromSupport;

  return {
    controlPlane: false,
    name
  };
}
