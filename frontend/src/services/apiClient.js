/**
 * Atlas API client — environment-aware base URL.
 * Development uses same-origin /api via Vite proxy (see vite.config.js).
 * Production requires VITE_API_BASE_URL (no hard-coded endpoints).
 */

import { getAuthHeaders } from "./atlasAuthService";
import { resolveApiBaseUrl } from "../config/apiBaseUrl";

const API_BASE = resolveApiBaseUrl();

async function withAuthHeaders(options = {}) {
  const authHeaders = await getAuthHeaders();

  return {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers || {})
    }
  };
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, await withAuthHeaders(options));

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function apiRequest(path, options = {}) {
  return fetch(`${API_BASE}${path}`, await withAuthHeaders(options));
}

export { API_BASE };
