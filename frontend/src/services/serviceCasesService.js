/**
 * BR-182 — Client Service cases API client.
 */

import { apiFetch } from "./apiClient";

export class ServiceCasesError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ServiceCasesError";
    this.status = status;
  }
}

function wrap(error, fallback) {
  const match = String(error.message || "").match(/^API (\d+):/);
  throw new ServiceCasesError(fallback, match ? Number(match[1]) : undefined);
}

export async function getServiceCases(options = {}) {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  if (options.scope && options.scope !== "mine") params.set("scope", options.scope);
  if (options.status) params.set("status", options.status);
  if (options.serviceType) params.set("serviceType", options.serviceType);
  if (options.clientId) params.set("clientId", options.clientId);
  if (options.ownerUserId) params.set("ownerUserId", options.ownerUserId);
  if (options.due && options.due !== "all") params.set("due", options.due);
  const query = params.toString();
  try {
    return await apiFetch(`/api/service-cases${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load service cases");
  }
}

export async function createServiceCase(payload = {}) {
  try {
    return await apiFetch("/api/service-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create service case");
  }
}

export async function updateServiceCase(id, payload = {}) {
  try {
    return await apiFetch(`/api/service-cases/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update service case");
  }
}

export async function updateServiceCaseStatus(id, payload = {}) {
  try {
    return await apiFetch(`/api/service-cases/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update service status");
  }
}

export async function createServiceFollowUp(id, payload = {}) {
  try {
    return await apiFetch(`/api/service-cases/${encodeURIComponent(id)}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create service follow-up");
  }
}
