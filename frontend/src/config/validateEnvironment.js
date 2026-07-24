/**
 * Production environment validation — warn only, never crash.
 */

export function validateProductionEnvironment() {
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
