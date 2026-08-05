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
    const error = new Error(
      payload.message || payload.error || `API ${response.status}: ${response.statusText}`
    );
    error.status = response.status;
    error.code = payload.error || payload.code || null;
    error.reconnectRequired = Boolean(payload.reconnectRequired);
    throw error;
  }

  return response.json();
}

export async function apiRequest(path, options = {}) {
  return fetch(`${API_BASE}${path}`, await withAuthHeaders(options));
}

export { API_BASE };
