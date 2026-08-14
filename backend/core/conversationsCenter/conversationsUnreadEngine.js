/**
 * Conversations unread + latest real communication (messaging inbox).
 * Unread ≠ NEEDS_ATTENTION / BR-080 / ownership.
 * Pure helpers — no I/O, no workflow mutations.
 *
 * Classification SoT: communicationClassification.js (BR-140).
 */

"use strict";

const {
  INTERNAL_INTENTS,
  BLOCKED_OUTBOUND_STATUSES,
  logText,
  normalizeDirection,
  isOperationalCommunicationText,
  isRealWhatsAppCommunication,
  isAudioCommunication,
  friendlyCommunicationPreview
} = require("../communicationClassification");

function logTimestampMs(row) {
  const ms = Date.parse(row?.created_at || row?.timestampUtc || "");
  return Number.isNaN(ms) ? null : ms;
}

function isProspectInbound(row) {
  return (
    isRealWhatsAppCommunication(row) && normalizeDirection(row?.direction) === "inbound"
  );
}

function computeLastCommunication(logs = []) {
  let latest = null;

  for (const row of logs) {
    if (!isRealWhatsAppCommunication(row)) {
      continue;
    }
    const ms = logTimestampMs(row);
    if (ms == null) {
      continue;
    }
    if (!latest || ms > latest.ms) {
      latest = { ms, row };
    }
  }

  if (!latest) {
    return {
      lastCommunicationAt: null,
      lastMessagePreview: null,
      lastMessagePreviewKind: null,
      lastDirection: null,
      lastMessageId: null
    };
  }

  const friendly = friendlyCommunicationPreview(latest.row, "en");

  return {
    lastCommunicationAt: new Date(latest.ms).toISOString(),
    lastMessagePreview: friendly.text,
    lastMessagePreviewKind: friendly.previewKind,
    lastDirection: normalizeDirection(latest.row.direction),
    lastMessageId: latest.row.id || latest.row.source?.recordId || null
  };
}

/**
 * Unread = prospect inbound the operator has not viewed.
 * lastReadInboundAt is the durable Conversations cursor (not BR-080).
 *
 * Conservative when cursor is missing (no backfill):
 * count trailing inbound after the last real outbound. Brand-new leads with
 * only inbound still increment. Historical Atlas-last threads stay read.
 */
function computeUnreadState({ logs = [], lastReadInboundAt = null } = {}) {
  const inbound = logs
    .filter(isProspectInbound)
    .map((row) => ({ row, ms: logTimestampMs(row) }))
    .filter((entry) => entry.ms != null)
    .sort((left, right) => left.ms - right.ms);

  if (!inbound.length) {
    return { unread: false, unreadCount: 0 };
  }

  const readMs = Date.parse(lastReadInboundAt || "");
  if (!Number.isNaN(readMs)) {
    const unreadRows = inbound.filter((entry) => entry.ms > readMs);
    return {
      unread: unreadRows.length > 0,
      unreadCount: unreadRows.length
    };
  }

  let lastOutboundMs = 0;
  for (const row of logs) {
    if (!isRealWhatsAppCommunication(row)) {
      continue;
    }
    if (normalizeDirection(row.direction) !== "outbound") {
      continue;
    }
    const ms = logTimestampMs(row);
    if (ms != null && ms > lastOutboundMs) {
      lastOutboundMs = ms;
    }
  }

  const trailing = lastOutboundMs
    ? inbound.filter((entry) => entry.ms > lastOutboundMs)
    : inbound;

  return {
    unread: trailing.length > 0,
    unreadCount: trailing.length
  };
}

function activitySortMs({ lastCommunicationAt = null, lastActivityAt = null } = {}) {
  const communicationMs = Date.parse(lastCommunicationAt || "");
  if (!Number.isNaN(communicationMs)) {
    return communicationMs;
  }
  const fallbackMs = Date.parse(lastActivityAt || "");
  return Number.isNaN(fallbackMs) ? 0 : fallbackMs;
}

module.exports = {
  INTERNAL_INTENTS,
  BLOCKED_OUTBOUND_STATUSES,
  normalizeDirection,
  logText,
  isOperationalCommunicationText,
  isRealWhatsAppCommunication,
  isAudioCommunication,
  isProspectInbound,
  computeLastCommunication,
  computeUnreadState,
  activitySortMs
};
