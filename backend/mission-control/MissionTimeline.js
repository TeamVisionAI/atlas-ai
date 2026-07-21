/**
 * Release 1.4 — Live event timeline (newest first).
 */

const crypto = require("crypto");

function buildTimelineEntry(input) {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    summary: input.summary,
    organizationId: input.organizationId || "default",
    conversationId: input.conversationId || null,
    workflowId: input.workflowId || null,
    connectorId: input.connectorId || null,
    metadata: input.metadata || {},
    timestamp: input.timestamp || new Date().toISOString()
  };
}

function prependTimeline(existing, entry, limit = 500) {
  const next = [entry, ...existing];
  return next.slice(0, limit);
}

module.exports = {
  buildTimelineEntry,
  prependTimeline
};
