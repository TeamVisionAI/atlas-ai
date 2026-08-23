/**
 * Production Railway API — documented in docs/00-executive/Current_System_State.md
 * Used only when VITE_API_BASE_URL is unset in a production build.
 */
const DOCUMENTED_PRODUCTION_API_BASE =
  "https://atlas-ai-production-01de.up.railway.app";

const DOCUMENTED_STAGING_API_BASE =
  "https://atlas-ai-staging-staging.up.railway.app";

const PRODUCTION_RAILWAY_HOSTS = Object.freeze([
  "atlas-ai-production-01de.up.railway.app"
]);

import { isStagingUi } from "./atlasUiEnv.js";

function readEnv(env) {
  if (env) {
    return env;
  }

  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

export function isProductionRailwayApiUrl(url) {
  try {
    return PRODUCTION_RAILWAY_HOSTS.includes(new URL(String(url).trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(env) {
  const runtime = readEnv(env);

  if (runtime.DEV) {
    return "";
  }

  const configured = String(runtime.VITE_API_BASE_URL || "").trim();

  if (isStagingUi(runtime)) {
    if (!configured) {
      throw new Error(
        "Atlas staging build blocked. VITE_ATLAS_ENV=staging requires VITE_API_BASE_URL."
      );
    }

    const normalized = configured.replace(/\/$/, "");

    if (isProductionRailwayApiUrl(normalized)) {
      throw new Error(
        "Atlas staging build blocked. VITE_API_BASE_URL must not point at production Railway."
      );
    }

    return normalized;
  }

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return DOCUMENTED_PRODUCTION_API_BASE;
}

export { DOCUMENTED_PRODUCTION_API_BASE, DOCUMENTED_STAGING_API_BASE, PRODUCTION_RAILWAY_HOSTS };
