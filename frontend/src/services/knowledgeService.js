/**
 * Atlas Knowledge Hub API client (authenticated).
 */

import { API_BASE } from "./apiClient";
import { getAuthHeaders } from "./atlasAuthService";

export class KnowledgeHubError extends Error {
  constructor(message, payload = {}) {
    super(message);
    this.name = "KnowledgeHubError";
    this.payload = payload;
  }
}

async function knowledgeRequest(path) {
  const headers = {
    ...(await getAuthHeaders())
  };

  const response = await fetch(`${API_BASE}${path}`, { headers });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new KnowledgeHubError(body.message || "Knowledge Hub request failed.", {
      status: response.status,
      error: body.error || null,
      code: body.error || null,
      reason: body.reason || null
    });
  }

  return body;
}

export async function fetchKnowledgeTree(locale = "en") {
  const query = new URLSearchParams({ locale });
  return knowledgeRequest(`/api/knowledge/tree?${query.toString()}`);
}

export async function getKnowledgeHubAccess() {
  return knowledgeRequest("/api/knowledge/access");
}

export async function fetchKnowledgeDocument(documentPath, locale = "en") {
  const query = new URLSearchParams({ path: documentPath, locale });
  return knowledgeRequest(`/api/knowledge/document?${query.toString()}`);
}
