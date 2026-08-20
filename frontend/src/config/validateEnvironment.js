/**
 * Production environment validation — warn only, never crash.
 * Staging builds fail closed when API routing is missing or points at production.
 */

import { resolveApiBaseUrl } from "./apiBaseUrl";
import { isStagingUi } from "./atlasUiEnv";

export function validateStagingEnvironment(env) {
  if (!isStagingUi(env)) {
    return;
  }

  resolveApiBaseUrl(env);
}

export function validateProductionEnvironment() {
  validateStagingEnvironment();

  if (import.meta.env.DEV) {
    return;
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL;

  if (apiBase == null || String(apiBase).trim() === "") {
    console.warn(
      "[Atlas] Missing VITE_API_BASE_URL. Production API endpoint has not been configured."
    );
  }
}
