/**
 * Production Railway API — documented in docs/00-executive/Current_System_State.md
 * Used only when VITE_API_BASE_URL is unset in a production build.
 */
const DOCUMENTED_PRODUCTION_API_BASE =
  "https://atlas-ai-production-01de.up.railway.app";

export function resolveApiBaseUrl() {
  if (import.meta.env.DEV) {
    return "";
  }

  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return DOCUMENTED_PRODUCTION_API_BASE;
}
