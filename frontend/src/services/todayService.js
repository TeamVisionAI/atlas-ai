/**
 * BR-184 — Today / Action Center API client.
 */

import { apiFetch } from "./apiClient";

export class TodayError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TodayError";
    this.status = status;
  }
}

/**
 * @param {{ scope?: string, filter?: string }} [options]
 */
export async function getToday(options = {}) {
  const params = new URLSearchParams();
  if (options.scope && options.scope !== "mine") {
    params.set("scope", options.scope);
  }
  if (options.filter && options.filter !== "all") {
    params.set("filter", options.filter);
  }
  const query = params.toString();
  try {
    return await apiFetch(`/api/today${query ? `?${query}` : ""}`);
  } catch (error) {
    const match = String(error.message || "").match(/^API (\d+):/);
    throw new TodayError("Failed to load Today", match ? Number(match[1]) : undefined);
  }
}
