/**
 * Sprint 12.0 — Canonical Meta Graph API version for server-side calls and SDK alignment.
 */

const DEFAULT_META_GRAPH_API_VERSION = "v25.0";

function getMetaGraphApiVersion(env = process.env) {
  const configured = env.META_GRAPH_API_VERSION;

  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }

  return DEFAULT_META_GRAPH_API_VERSION;
}

module.exports = {
  DEFAULT_META_GRAPH_API_VERSION,
  getMetaGraphApiVersion
};
