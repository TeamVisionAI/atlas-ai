/**
 * Sprint 15.2 — Authenticated Prospect Engine API client (reuse existing backend routes).
 */

import { getAuthHeaders } from "../../../services/atlasAuthService";
import { apiRequest } from "../../../services/apiClient";

export class ProspectLifecycleError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "ProspectLifecycleError";
    this.status = status;
    this.payload = payload;
  }
}

async function prospectRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
    ...(options.headers || {})
  };

  const response = await apiRequest(path, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ProspectLifecycleError(payload.message || "Prospect request failed.", {
      status: response.status,
      payload
    });
  }

  return payload;
}

export async function searchProspects(query = {}) {
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.lifecycleState) {
    params.set("lifecycleState", query.lifecycleState);
  }

  if (query.limit) {
    params.set("limit", String(query.limit));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return prospectRequest(`/api/prospects${suffix}`);
}

export async function getProspectById(prospectId) {
  return prospectRequest(`/api/prospects/${encodeURIComponent(prospectId)}`);
}

export async function updateProspect(prospectId, body) {
  return prospectRequest(`/api/prospects/${encodeURIComponent(prospectId)}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function assignProspect(prospectId, body) {
  return prospectRequest(`/api/prospects/${encodeURIComponent(prospectId)}/assign`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function archiveProspect(prospectId, body = {}) {
  return prospectRequest(`/api/prospects/${encodeURIComponent(prospectId)}/archive`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function restoreProspect(prospectId, body = {}) {
  return prospectRequest(`/api/prospects/${encodeURIComponent(prospectId)}/restore`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function mergeProspects(body) {
  return prospectRequest("/api/prospects/merge", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
