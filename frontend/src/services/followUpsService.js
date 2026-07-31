/**
 * Sprint 12.5.2 — Follow-ups queue API client.
 */

import { apiFetch } from "./apiClient";

export class FollowUpsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "FollowUpsError";
    this.status = status;
  }
}

/**
 * @param {{ filter?: string, search?: string, sort?: string }} [options]
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

  const query = params.toString();

  try {
    return await apiFetch(`/api/follow-ups${query ? `?${query}` : ""}`);
  } catch (error) {
    const match = error.message.match(/^API (\d+):/);
    throw new FollowUpsError("Failed to load follow-ups queue", match ? Number(match[1]) : undefined);
  }
}
