/**
 * Sprint 15.2 — Timeline Engine read API (reuse existing backend routes).
 */

import { getAuthHeaders } from "../../../services/atlasAuthService";
import { apiRequest } from "../../../services/apiClient";

export class ProspectTimelineError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProspectTimelineError";
    this.status = status;
  }
}

export async function getProspectTimeline(prospectId, options = {}) {
  const params = new URLSearchParams();

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  if (options.offset) {
    params.set("offset", String(options.offset));
  }

  if (options.entryType) {
    params.set("entryType", options.entryType);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const headers = await getAuthHeaders();

  const response = await apiRequest(
    `/api/prospects/${encodeURIComponent(prospectId)}/timeline${suffix}`,
    { headers }
  );

  if (!response.ok) {
    throw new ProspectTimelineError("Failed to load prospect timeline.", response.status);
  }

  return response.json();
}
