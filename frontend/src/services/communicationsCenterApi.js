/**
 * Communications Center API — prospect-id canonical.
 * Cache identity guidance: communications:${organizationId}:${prospectId}
 */

import { getAuthHeaders } from "./atlasAuthService";
import { apiRequest } from "./apiClient";

export class CommunicationsCenterError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = "CommunicationsCenterError";
    this.status = status;
    this.code = code;
  }
}

export { buildCommunicationsCacheKey } from "../engines/communicationsCenterViewModel";

const inFlightCommunications = new Map();

export async function getProspectCommunications(prospectId, options = {}) {
  if (!prospectId) {
    throw new CommunicationsCenterError("Prospect id is required.", 400);
  }

  const params = new URLSearchParams();

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  if (options.timezone) {
    params.set("timezone", String(options.timezone));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const cacheKey = `${prospectId}:${suffix}`;
  const existing = inFlightCommunications.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const headers = await getAuthHeaders();
    const response = await apiRequest(
      `/api/prospects/${encodeURIComponent(prospectId)}/communications${suffix}`,
      { headers }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new CommunicationsCenterError(
        payload.message || "Failed to load communications timeline.",
        response.status,
        payload.error || null
      );
    }

    return response.json();
  })().finally(() => {
    inFlightCommunications.delete(cacheKey);
  });

  inFlightCommunications.set(cacheKey, pending);
  return pending;
}
