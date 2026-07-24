/**
 * Sprint 12.0 — Canonical Meta Graph API version for FB.init (must match backend META_GRAPH_API_VERSION).
 */

export const DEFAULT_META_GRAPH_API_VERSION = "v25.0";

export function getMetaGraphApiVersion() {
  const configured = import.meta.env.VITE_META_GRAPH_API_VERSION;

  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }

  return DEFAULT_META_GRAPH_API_VERSION;
}
