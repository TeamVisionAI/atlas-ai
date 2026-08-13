/**
 * Conversations unread + latest real communication (messaging inbox).
 * Unread ≠ NEEDS_ATTENTION / BR-080 / ownership.
 * Pure helpers — no I/O, no workflow mutations.
 */

"use strict";

const INTERNAL_INTENTS = new Set([
  "REQUIRED_INFORMATION",
  "CONVERSATION_OUTCOME",
  "AGENT_ACTION",
  "REQUIRED_INFORMATION_UPDATED"
]);

const BLOCKED_OUTBOUND_STATUSES = new Set([
  "blocked_template_missing",
  "blocked_window_closed",
  "blocked_template_unapproved",
  "retry_required",
  "provider_failed"
]);

/**
 * Same communication-only rule as Conversations transcript
 * (`isConversationBubbleItem`): bracketed operational / provider / diagnostic
 * text is never a list preview or lastCommunicationAt source.
 */
function isOperationalCommunicationText(text) {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }
  if (value.startsWith("[Agent note]")) {
    return true;
  }
  if (/^\[[^\]]+\]/.test(value)) {
    return true;
  }
  if (/whatsapp_outbound:/i.test(value)) {
    return true;
  }
  if (
    /blocked_template_missing|blocked_window_closed|blocked_template_unapproved/i.test(
      value
    )
  ) {
    return true;
  }
  return false;
}

function normalizeDirection(direction) {
  const value = String(direction || "").toLowerCase();
  if (value === "incoming" || value === "inbound") {
    return "inbound";
  }
  if (value === "outgoing" || value === "outbound") {
    return "outbound";
  }
  return null;
}

function logTimestampMs(row) {
  const ms = Date.parse(row?.created_at || row?.timestampUtc || "");
  return Number.isNaN(ms) ? null : ms;
}

function logText(row) {
  return String(row?.message || row?.text || row?.content?.text || "").trim();
}

/**
 * Prospect / Atlas / Human WhatsApp only.
 * Aligns with frontend `isConversationBubbleItem` (Conversations transcript).
 * System logs, qualification saves, workflow events, provider errors, and
 * internal notes do not count for preview, lastCommunicationAt, or unread.
 */
function isRealWhatsAppCommunication(row) {
  const direction = normalizeDirection(row?.direction);
  if (!direction) {
    return false;
  }

  const text = logText(row);
  if (isOperationalCommunicationText(text)) {
    return false;
  }

  const intent = String(row?.intent || row?.ai?.intent || "").toUpperCase();
  if (INTERNAL_INTENTS.has(intent)) {
    return false;
  }
  if (intent.startsWith("WHATSAPP_OUTBOUND_")) {
    return false;
  }

  const status = String(row?.status || row?.delivery_status || "").toLowerCase();
  if (BLOCKED_OUTBOUND_STATUSES.has(status)) {
    return false;
  }

  const pipeline = String(row?.pipeline || "").toUpperCase();
  if (
    pipeline === "SYSTEM" ||
    pipeline === "WORKFLOW" ||
    pipeline === "QUALIFICATION" ||
    pipeline === "DIAGNOSTIC"
  ) {
    return false;
  }

  const channel = String(row?.channel || "whatsapp").toLowerCase();
  if (channel && channel !== "whatsapp") {
    return false;
  }

  return true;
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
      lastDirection: null,
      lastMessageId: null
    };
  }

  const preview = logText(latest.row)
    .replace(/^\[Agent note\]\s*/i, "")
    .slice(0, 160);

  return {
    lastCommunicationAt: new Date(latest.ms).toISOString(),
    lastMessagePreview: preview || null,
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
  normalizeDirection,
  isOperationalCommunicationText,
  isRealWhatsAppCommunication,
  isProspectInbound,
  computeLastCommunication,
  computeUnreadState,
  activitySortMs
};
