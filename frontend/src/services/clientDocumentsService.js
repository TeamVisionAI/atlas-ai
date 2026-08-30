/**
 * BR-183 — Client documents and document-request API client.
 */

import { apiFetch, apiRequest } from "./apiClient";

export class ClientDocumentsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ClientDocumentsError";
    this.status = status;
  }
}

function wrap(error, fallback) {
  const match = String(error.message || "").match(/^API (\d+):/);
  throw new ClientDocumentsError(
    error.message || fallback,
    match ? Number(match[1]) : error.status
  );
}

export async function getDocumentRequests(options = {}) {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  if (options.scope && options.scope !== "mine") params.set("scope", options.scope);
  if (options.status) params.set("status", options.status);
  if (options.documentType) params.set("documentType", options.documentType);
  if (options.clientId) params.set("clientId", options.clientId);
  if (options.serviceCaseId) params.set("serviceCaseId", options.serviceCaseId);
  if (options.ownerUserId) params.set("ownerUserId", options.ownerUserId);
  if (options.due && options.due !== "all") params.set("due", options.due);
  const query = params.toString();
  try {
    return await apiFetch(`/api/document-requests${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load document requests");
  }
}

export async function createDocumentRequest(payload = {}) {
  try {
    return await apiFetch("/api/document-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create document request");
  }
}

export async function updateDocumentRequest(id, payload = {}) {
  try {
    return await apiFetch(`/api/document-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update document request");
  }
}

export async function updateDocumentRequestStatus(id, payload = {}) {
  try {
    return await apiFetch(`/api/document-requests/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update document request status");
  }
}

export async function createDocumentRequestFollowUp(id, payload = {}) {
  try {
    return await apiFetch(`/api/document-requests/${encodeURIComponent(id)}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create document request follow-up");
  }
}

export async function getDocuments(options = {}) {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  if (options.scope && options.scope !== "mine") params.set("scope", options.scope);
  if (options.status) params.set("status", options.status);
  if (options.documentType) params.set("documentType", options.documentType);
  if (options.clientId) params.set("clientId", options.clientId);
  if (options.serviceCaseId) params.set("serviceCaseId", options.serviceCaseId);
  if (options.ownerUserId) params.set("ownerUserId", options.ownerUserId);
  const query = params.toString();
  try {
    return await apiFetch(`/api/documents${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load documents");
  }
}

export async function uploadDocument({ file, ...fields } = {}) {
  const body = new FormData();
  if (file) body.append("file", file);
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") body.append(key, String(value));
  });
  try {
    return await apiFetch("/api/documents/upload", { method: "POST", body });
  } catch (error) {
    wrap(error, "Failed to upload document");
  }
}

export async function updateDocumentStatus(id, payload = {}) {
  try {
    return await apiFetch(`/api/documents/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update document status");
  }
}

export async function linkDocumentToRequest(id, payload = {}) {
  try {
    return await apiFetch(`/api/documents/${encodeURIComponent(id)}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to link document");
  }
}

export async function downloadDocument(id) {
  try {
    const response = await apiRequest(`/api/documents/${encodeURIComponent(id)}/download`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ClientDocumentsError(payload.message || "Failed to download document", response.status);
    }
    return response.blob();
  } catch (error) {
    if (error instanceof ClientDocumentsError) throw error;
    wrap(error, "Failed to download document");
  }
}
