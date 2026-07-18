/**
 * Sprint 10.2b — Idempotent dual-write from conversation_logs to workflow_events.
 * Implements BR/event-stream: every message interaction becomes a prospect-scoped event.
 */

const { emit } = require("./eventEngine");
const { EVENT_TYPES } = require("./workflowConstants");
const { findWorkflowEventByCorrelationId } = require("../services/workflowEventService");

const AGENT_NOTE_PREFIX = "[Agent note]";
const CORRELATION_PREFIX = "conversation_log:";

function buildConversationLogCorrelationId(logId) {
  return `${CORRELATION_PREFIX}${logId}`;
}

function extractLinkedConversationLogId(row) {
  if (row?.payload?.conversationLogId) {
    return String(row.payload.conversationLogId);
  }

  if (row?.correlation_id?.startsWith(CORRELATION_PREFIX)) {
    return row.correlation_id.slice(CORRELATION_PREFIX.length);
  }

  return null;
}

function resolveMessageActor(logRow) {
  const direction = String(logRow.direction || "").toLowerCase();

  if (direction === "incoming") {
    return "prospect";
  }

  if (String(logRow.intent || "").toUpperCase() === "AGENT_ACTION") {
    return "AGENT";
  }

  return "ATLAS";
}

function resolveEventTypeForLog(logRow) {
  const message = String(logRow.message || "");

  if (message.startsWith(AGENT_NOTE_PREFIX)) {
    return EVENT_TYPES.AGENT_NOTE_ADDED;
  }

  const direction = String(logRow.direction || "").toLowerCase();

  if (direction === "incoming") {
    return EVENT_TYPES.MESSAGE_RECEIVED;
  }

  return EVENT_TYPES.MESSAGE_SENT;
}

function buildPayloadForLog(logRow) {
  const message = String(logRow.message || "");
  const isAgentNote = message.startsWith(AGENT_NOTE_PREFIX);

  return {
    conversationLogId: logRow.id,
    direction: logRow.direction || null,
    bodyPreview: message.slice(0, 280),
    intent: logRow.intent || null,
    channel: "whatsapp",
    ...(isAgentNote
      ? { noteText: message.slice(AGENT_NOTE_PREFIX.length).trim() }
      : {})
  };
}

/**
 * Emit workflow event for a conversation_logs row (idempotent by correlationId).
 * @param {Object} logRow — inserted conversation_logs row with `id`
 */
async function emitConversationLogEvent(logRow) {
  if (!logRow?.id || !logRow?.prospect_phone) {
    return { success: false, error: "INVALID_LOG_ROW" };
  }

  const correlationId = buildConversationLogCorrelationId(logRow.id);
  const existing = await findWorkflowEventByCorrelationId(correlationId);

  if (existing) {
    return { success: true, skipped: true, event: existing };
  }

  const eventType = resolveEventTypeForLog(logRow);

  return emit(eventType, {
    prospectPhone: logRow.prospect_phone,
    actor: resolveMessageActor(logRow),
    correlationId,
    payload: buildPayloadForLog(logRow)
  });
}

module.exports = {
  AGENT_NOTE_PREFIX,
  CORRELATION_PREFIX,
  buildConversationLogCorrelationId,
  extractLinkedConversationLogId,
  emitConversationLogEvent
};
