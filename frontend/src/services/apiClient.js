/**
 * Atlas API client — environment-aware base URL.
 * Development uses same-origin /api via Vite proxy (see vite.config.js).
 * Production requires VITE_API_BASE_URL (no hard-coded endpoints).
 */

const API_BASE = import.meta.env.DEV
  ? ""
  : String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    throw new Error(
      `API ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

export async function apiRequest(path, options = {}) {
  return fetch(`${API_BASE}${path}`, options);
}

export { API_BASE };
