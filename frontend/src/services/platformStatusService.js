/**
 * Sprint 17.0 — Platform status API client (authenticated).
 */

import { API_BASE } from "./apiClient";
import { getAuthHeaders } from "./atlasAuthService";

export class PlatformStatusError extends Error {
  constructor(message, payload = {}) {
    super(message);
    this.name = "PlatformStatusError";
    this.payload = payload;
  }
}

async function platformStatusRequest(path) {
  const headers = {
    ...(await getAuthHeaders())
  };

  const response = await fetch(`${API_BASE}${path}`, { headers });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new PlatformStatusError(body.message || "Platform status request failed.", {
      status: response.status,
      error: body.error || null,
      warnings: body.warnings || []
    });
  }

  return body;
}

export async function fetchPlatformStatus({ forceRefresh = false } = {}) {
  const query = forceRefresh ? "?refresh=1" : "";
  return platformStatusRequest(`/api/platform-status${query}`);
}
