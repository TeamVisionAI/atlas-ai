/**
 * Sprint 10.2b — Prospect activity feed read projection.
 * Federates workflow_events + legacy conversation_logs (deduped by conversationLogId).
 * workflow_events remains canonical store; see docs/SPRINT_10_2B_ACTIVITY_FEED.md.
 */

const { supabase } = require("../services/supabaseService");
const { extractLinkedConversationLogId } = require("./conversationEventBridge");
const {
  encodeActivityFeedCursor,
  decodeActivityFeedCursor,
  isActivityBeforeCursor
} = require("./activityFeedCursor");
const { EVENT_TYPES } = require("./workflowConstants");

const DEFAULT_LIMIT = 25;
const MAX_MERGE_WINDOW = 500;

const REMINDER_EVENT_TYPES = new Set([
  EVENT_TYPES.REMINDER_SCHEDULED,
  EVENT_TYPES.REMINDER_SENT
]);

function mapEventTypeToActivityType(eventType) {
  switch (eventType) {
    case EVENT_TYPES.MESSAGE_RECEIVED:
      return "message_inbound";
    case EVENT_TYPES.MESSAGE_SENT:
      return "message_outbound";
    case EVENT_TYPES.AGENT_NOTE_ADDED:
      return "note";
    case EVENT_TYPES.CONVERSATION_STARTED:
    case EVENT_TYPES.CONVERSATION_REOPENED:
    case EVENT_TYPES.CONVERSATION_ASSIGNED:
    case EVENT_TYPES.CONVERSATION_CLOSED:
      return "system";
    default:
      if (REMINDER_EVENT_TYPES.has(eventType)) {
        return "reminder";
      }

      if (
        eventType === EVENT_TYPES.WORKFLOW_OWNERSHIP_CHANGED ||
        eventType === EVENT_TYPES.PROSPECT_CREATED
      ) {
        return "system";
      }

      return "workflow_event";
  }
}

function mapLogRowToActivityType(logRow) {
  const message = String(logRow.message || "");

  if (message.startsWith("[Agent note]")) {
    return "note";
  }

  const direction = String(logRow.direction || "").toLowerCase();

  if (direction === "incoming") {
    return "message_inbound";
  }

  return "message_outbound";
}

function normalizeActor(actor) {
  if (!actor) {
    return "SYSTEM";
  }

  const value = String(actor);

  if (value.startsWith("AGENT:")) {
    return "AGENT";
  }

  if (value === "prospect") {
    return "prospect";
  }

  return value.toUpperCase();
}

function mapWorkflowEventRow(row) {
  return {
    id: `event:${row.id}`,
    activityType: mapEventTypeToActivityType(row.event_type),
    timestamp: row.created_at,
    actor: normalizeActor(row.actor),
    eventType: row.event_type,
    payload: {
      ...(row.payload || {}),
      milestoneBefore: row.milestone_before || null,
      milestoneAfter: row.milestone_after || null,
      ownershipBefore: row.ownership_before || null,
      ownershipAfter: row.ownership_after || null
    }
  };
}

function mapConversationLogRow(row) {
  const message = String(row.message || "");
  const isAgentNote = message.startsWith("[Agent note]");

  return {
    id: `log:${row.id}`,
    activityType: mapLogRowToActivityType(row),
    timestamp: row.created_at,
    actor: mapLogRowToActivityType(row) === "message_inbound" ? "prospect" : "AGENT",
    eventType: isAgentNote ? EVENT_TYPES.AGENT_NOTE_ADDED : null,
    payload: {
      conversationLogId: row.id,
      direction: row.direction || null,
      bodyPreview: message.slice(0, 280),
      intent: row.intent || null,
      legacy: true,
      ...(isAgentNote ? { noteText: message.slice("[Agent note]".length).trim() } : {})
    }
  };
}

function collectLinkedConversationLogIds(eventRows) {
  const linked = new Set();

  for (const row of eventRows) {
    const logId = extractLinkedConversationLogId(row);

    if (logId) {
      linked.add(logId);
    }
  }

  return linked;
}

async function loadWorkflowEventsForProspect(phone) {
  const { data, error } = await supabase
    .from("workflow_events")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: false })
    .limit(MAX_MERGE_WINDOW);

  if (error) {
    if (
      error.code === "42P01" ||
      error.message?.includes("workflow_events")
    ) {
      return [];
    }

    throw error;
  }

  return data || [];
}

async function loadLegacyConversationLogs(phone, excludedLogIds) {
  const { data, error } = await supabase
    .from("conversation_logs")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: false })
    .limit(MAX_MERGE_WINDOW);

  if (error) {
    throw error;
  }

  return (data || []).filter((row) => !excludedLogIds.has(String(row.id)));
}

function sortActivityItemsDesc(items) {
  return items.sort((a, b) => {
    const timeDelta = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return String(b.id).localeCompare(String(a.id));
  });
}

function filterByActivityTypes(items, types) {
  if (!types?.length) {
    return items;
  }

  const allowed = new Set(types);
  return items.filter((item) => allowed.has(item.activityType));
}

/**
 * @param {string} phone
 * @param {{ limit?: number, cursor?: string, types?: string[] }} [options]
 */
async function listProspectActivityFeed(phone, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), 50);
  const cursor = decodeActivityFeedCursor(options.cursor);
  const typeFilter = Array.isArray(options.types) ? options.types.filter(Boolean) : null;

  const eventRows = await loadWorkflowEventsForProspect(phone);
  const linkedLogIds = collectLinkedConversationLogIds(eventRows);
  const legacyLogs = await loadLegacyConversationLogs(phone, linkedLogIds);

  let items = [
    ...eventRows.map(mapWorkflowEventRow),
    ...legacyLogs.map(mapConversationLogRow)
  ];

  items = sortActivityItemsDesc(items);

  if (typeFilter?.length) {
    items = filterByActivityTypes(items, typeFilter);
  }

  if (cursor) {
    items = items.filter((item) => isActivityBeforeCursor(item, cursor));
  }

  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  const nextCursor = hasMore ? encodeActivityFeedCursor(page[page.length - 1]) : null;

  return {
    generatedAt: new Date().toISOString(),
    phone,
    items: page,
    nextCursor,
    hasMore
  };
}

async function listProspectActivityPreview(phone, previewLimit = 5) {
  const feed = await listProspectActivityFeed(phone, { limit: previewLimit });
  return feed.items;
}

module.exports = {
  listProspectActivityFeed,
  listProspectActivityPreview,
  mapEventTypeToActivityType,
  mapWorkflowEventRow,
  mapConversationLogRow
};
