/**
 * Local / internal development previews.
 * Never enabled in production builds. Does not affect Meta Review allowlists.
 *
 * Note: do not use `/dev/*` for SPA previews — Vite proxies `/dev` to the backend.
 */

import { parseEnvBoolean } from "./parseEnvBoolean";

export function isProductionBuild() {
  return import.meta.env.PROD === true;
}

export function getInternalPreviewsFlag() {
  return import.meta.env.VITE_ENABLE_INTERNAL_PREVIEWS;
}

/**
 * True only when:
 * - not a production build (Vite PROD)
 * - and VITE_ENABLE_INTERNAL_PREVIEWS=true
 */
export function isInternalPreviewEnabled() {
  if (isProductionBuild()) {
    return false;
  }

  return parseEnvBoolean(getInternalPreviewsFlag());
}

/** Primary local preview URL (not proxied; not in Meta Review sidebar). */
export const POLICY_INTELLIGENCE_PREVIEW_PATH = "/internal-preview/policy-intelligence";

/** Alternate local path (also not under Vite `/dev` proxy). */
export const POLICY_INTELLIGENCE_PREVIEW_ALIAS_PATH = "/local-preview/policy-intelligence";
