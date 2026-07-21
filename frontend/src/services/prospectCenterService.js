/**
 * Sprint 10.3 — Prospect Center API client.
 */

import { apiFetch } from "./apiClient";

export class ProspectCenterError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProspectCenterError";
    this.status = status;
  }
}

/**
 * @param {{ filter?: string, search?: string }} [options]
 */
export async function getProspectCenter(options = {}) {
  const params = new URLSearchParams();

  if (options.filter && options.filter !== "all") {
    params.set("filter", options.filter);
  }

  if (options.search) {
    params.set("q", options.search);
  }

  const query = params.toString();

  try {
    return await apiFetch(`/api/prospect-center${query ? `?${query}` : ""}`);
  } catch (error) {
    const match = error.message.match(/^API (\d+):/);
    throw new ProspectCenterError(
      "Failed to load prospect center",
      match ? Number(match[1]) : undefined
    );
  }
}
