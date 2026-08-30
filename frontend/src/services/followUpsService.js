/**
 * BR-178 — Follow-up Engine V2 API client.
 */

import { apiFetch } from "./apiClient";

export class FollowUpsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "FollowUpsError";
    this.status = status;
  }
}

function wrap(error, fallback) {
  const match = String(error.message || "").match(/^API (\d+):/);
  throw new FollowUpsError(fallback, match ? Number(match[1]) : undefined);
}

/**
 * @param {{ filter?: string, search?: string, sort?: string, scope?: string }} [options]
 */
export async function getFollowUps(options = {}) {
  const params = new URLSearchParams();

  if (options.filter && options.filter !== "all") {
    params.set("filter", options.filter);
  }

  if (options.search) {
    params.set("q", options.search);
  }

  if (options.sort) {
    params.set("sort", options.sort);
  }

  if (options.scope && options.scope !== "mine") {
    params.set("scope", options.scope);
  }

  const query = params.toString();

  try {
    return await apiFetch(`/api/follow-ups${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load follow-ups queue");
  }
}

export async function createFollowUp(payload) {
  try {
    return await apiFetch("/api/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create follow-up");
  }
}

export async function completeFollowUp(id, payload = {}) {
  try {
    return await apiFetch(`/api/follow-ups/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to complete follow-up");
  }
}

export async function rescheduleFollowUp(id, payload) {
  try {
    return await apiFetch(`/api/follow-ups/${id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to reschedule follow-up");
  }
}

export async function cancelFollowUp(id, payload = {}) {
  try {
    return await apiFetch(`/api/follow-ups/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to cancel follow-up");
  }
}
