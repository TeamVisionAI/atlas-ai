/**
 * BR-181 — Client Production / Activity API client.
 */

import { apiFetch } from "./apiClient";

export class ProductionError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProductionError";
    this.status = status;
  }
}

function wrap(error, fallback) {
  const match = String(error.message || "").match(/^API (\d+):/);
  throw new ProductionError(fallback, match ? Number(match[1]) : undefined);
}

export async function getProductionList(options = {}) {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  if (options.scope && options.scope !== "mine") params.set("scope", options.scope);
  if (options.status) params.set("status", options.status);
  if (options.activityType) params.set("activityType", options.activityType);
  if (options.clientId) params.set("clientId", options.clientId);
  if (options.ownerUserId) params.set("ownerUserId", options.ownerUserId);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  const query = params.toString();
  try {
    return await apiFetch(`/api/production${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load production");
  }
}

export async function getProduction(id) {
  try {
    return await apiFetch(`/api/production/${encodeURIComponent(id)}`);
  } catch (error) {
    wrap(error, "Failed to load production record");
  }
}

export async function createProduction(payload = {}) {
  try {
    return await apiFetch("/api/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create production");
  }
}

export async function updateProduction(id, payload = {}) {
  try {
    return await apiFetch(`/api/production/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update production");
  }
}

export async function updateProductionStatus(id, payload = {}) {
  try {
    return await apiFetch(`/api/production/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update production status");
  }
}

export async function createProductionFollowUp(id, payload = {}) {
  try {
    return await apiFetch(`/api/production/${encodeURIComponent(id)}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create production follow-up");
  }
}
