/**
 * Communications Center API — prospect-id canonical.
 * Cache identity guidance: communications:${organizationId}:${prospectId}
 */

import { getAuthHeaders } from "./atlasAuthService";
import { apiRequest } from "./apiClient";

export class CommunicationsCenterError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = "CommunicationsCenterError";
    this.status = status;
    this.code = code;
  }
}

export { buildCommunicationsCacheKey } from "../engines/communicationsCenterViewModel";

const THREAD_CACHE_TTL_MS = 45000;
const inFlightCommunications = new Map();
const communicationsCache = new Map();

function buildRequestKey(prospectId, options = {}) {
  const params = new URLSearchParams();

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  if (options.timezone) {
    params.set("timezone", String(options.timezone));
  }

  if (options.projection) {
    params.set("projection", String(options.projection));
  }

  if (options.before) {
    params.set("before", String(options.before));
  }

  const suffix = params.toString();
  return `${prospectId}:${suffix || "default"}`;
}

export function buildCommunicationsRequestKey(prospectId, options = {}) {
  return buildRequestKey(prospectId, options);
}

export function readCommunicationsCache(cacheKey) {
  const entry = communicationsCache.get(cacheKey);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.at > THREAD_CACHE_TTL_MS) {
    communicationsCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

export function writeCommunicationsCache(cacheKey, data) {
  communicationsCache.set(cacheKey, { at: Date.now(), data });
}

export function mergeCommunicationsPages(existing, olderPage) {
  if (!existing) {
    return olderPage;
  }
  if (!olderPage) {
    return existing;
  }

  const seen = new Set((existing.items || []).map((item) => item.id));
  const mergedOlder = (olderPage.items || []).filter((item) => !seen.has(item.id));

  return {
    ...existing,
    items: [...mergedOlder, ...(existing.items || [])],
    pagination: {
      ...(existing.pagination || {}),
      hasMore: Boolean(olderPage.pagination?.hasMore),
      nextCursor: olderPage.pagination?.nextCursor || null,
      before: olderPage.pagination?.before || null
    },
    sources: olderPage.sources || existing.sources
  };
}

export async function getProspectCommunications(prospectId, options = {}) {
  if (!prospectId) {
    throw new CommunicationsCenterError("Prospect id is required.", 400);
  }

  const cacheKey = buildRequestKey(prospectId, options);
  const existing = inFlightCommunications.get(cacheKey);
  if (existing) {
    return existing;
  }

  if (!options.force) {
    const cached = readCommunicationsCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const params = new URLSearchParams();

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  if (options.timezone) {
    params.set("timezone", String(options.timezone));
  }

  if (options.projection) {
    params.set("projection", String(options.projection));
  }

  if (options.before) {
    params.set("before", String(options.before));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  const pending = (async () => {
    const headers = await getAuthHeaders();
    const response = await apiRequest(
      `/api/prospects/${encodeURIComponent(prospectId)}/communications${suffix}`,
      { headers }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new CommunicationsCenterError(
        payload.message || "Failed to load communications timeline.",
        response.status,
        payload.error || null
      );
    }

    const data = await response.json();
    writeCommunicationsCache(cacheKey, data);
    return data;
  })().finally(() => {
    inFlightCommunications.delete(cacheKey);
  });

  inFlightCommunications.set(cacheKey, pending);
  return pending;
}

export function invalidateProspectCommunicationsCache(prospectId) {
  const prefix = `${prospectId}:`;
  for (const key of [...communicationsCache.keys(), ...inFlightCommunications.keys()]) {
    if (key.startsWith(prefix)) {
      communicationsCache.delete(key);
      inFlightCommunications.delete(key);
    }
  }
}
