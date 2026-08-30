/**
 * BR-179 — Client Workspace V1 API client.
 */

import { apiFetch } from "./apiClient";

export class ClientsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ClientsError";
    this.status = status;
  }
}

function wrap(error, fallback) {
  const match = String(error.message || "").match(/^API (\d+):/);
  throw new ClientsError(fallback, match ? Number(match[1]) : undefined);
}

export async function getClients(options = {}) {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  if (options.scope && options.scope !== "mine") params.set("scope", options.scope);
  const query = params.toString();
  try {
    return await apiFetch(`/api/clients${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load clients");
  }
}

export async function getClient(id) {
  try {
    return await apiFetch(`/api/clients/${encodeURIComponent(id)}`);
  } catch (error) {
    wrap(error, "Failed to load client");
  }
}

export async function addClientNote(id, payload = {}) {
  try {
    return await apiFetch(`/api/clients/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to add client note");
  }
}

export async function updateClientStatus(id, payload = {}) {
  try {
    return await apiFetch(`/api/clients/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update client status");
  }
}
