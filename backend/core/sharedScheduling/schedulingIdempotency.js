/**
 * ATLAS_SHARED_SCHEDULING_V2 — deterministic scheduling attempt idempotency keys.
 */

"use strict";

const crypto = require("crypto");

function stableHash(parts = []) {
  const payload = parts
    .map((part) => (part == null ? "" : String(part)))
    .join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function buildSchedulingAttemptId({
  organizationId = null,
  agentId = null,
  prospectId = null,
  prospectPhone = null,
  appointmentType = null,
  dateKey = null,
  timeKey = null,
  timezone = null,
  inboundMessageId = null
} = {}) {
  if (!dateKey || !timeKey) {
    return null;
  }
  const scope = stableHash([
    organizationId,
    agentId,
    prospectId || prospectPhone,
    appointmentType,
    dateKey,
    timeKey,
    timezone
  ]);
  if (inboundMessageId) {
    return `scheduling-attempt:${scope}:${inboundMessageId}`;
  }
  return `scheduling-attempt:${scope}`;
}

module.exports = {
  buildSchedulingAttemptId,
  stableHash
};
