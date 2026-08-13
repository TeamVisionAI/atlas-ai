/**
 * Production environment validation — warn only, never crash.
 * Staging builds fail closed when API routing is missing or points at production.
 */

import { getMetaReviewModeRawValue, isMetaReviewModeEnabled } from "./metaReviewMode";
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

  const metaReviewRaw = getMetaReviewModeRawValue();

  if (metaReviewRaw == null || String(metaReviewRaw).trim() === "") {
    console.warn(
      "[Atlas] VITE_META_REVIEW_MODE is unset in this build. Meta Review UI features are disabled until the variable is set in Vercel and the frontend is redeployed."
    );
    return;
  }

  if (!isMetaReviewModeEnabled()) {
    console.warn(
      `[Atlas] VITE_META_REVIEW_MODE=${JSON.stringify(metaReviewRaw)} did not parse as enabled. Use true (any casing) for Meta Review UI.`
    );
  }
}
