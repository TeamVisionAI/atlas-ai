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
      error: body.error || null
    });
  }

  return body;
}

export async function fetchKnowledgeTree() {
  return knowledgeRequest("/api/knowledge/tree");
}

export async function fetchKnowledgeDocument(documentPath) {
  const query = new URLSearchParams({ path: documentPath });
  return knowledgeRequest(`/api/knowledge/document?${query.toString()}`);
}
