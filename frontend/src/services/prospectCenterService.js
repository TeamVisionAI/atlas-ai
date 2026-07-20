/**
 * Sprint 10.3 — Prospect Center API client.
 */

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
  const response = await fetch(`/api/prospect-center${query ? `?${query}` : ""}`);

  if (!response.ok) {
    throw new ProspectCenterError("Failed to load prospect center", response.status);
  }

  return response.json();
}
