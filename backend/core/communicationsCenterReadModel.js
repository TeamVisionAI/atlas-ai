/**
 * Communications Center — read-only chronological aggregation.
 * Does not mutate appointments, send WhatsApp, or change Recruit AI decisions.
 *
 * Primary: conversation_logs
 * Enrich: whatsapp_outbound_deliveries, workflow_events, atlas_appointments
 * Optional: atlas_business_events, atlas_timeline_entries (when prospect-linked)
 */

const { EVENT_TYPES } = require("./workflowConstants");
const { isTableMissingError } = require("./supabaseTableErrors");

const CONVERSATION_LOG_CORRELATION_PREFIX = "conversation_log:";

function getSupabase() {
  return require("../services/supabaseService").supabase;
}

function getAppointmentRepository() {
  return require("../repositories/appointmentRepository");
}

/** Local copy — avoids importing conversationEventBridge (pulls Supabase at load). */
function extractLinkedConversationLogId(row) {
  if (row?.payload?.conversationLogId) {
    return String(row.payload.conversationLogId);
  }

  if (row?.correlation_id?.startsWith(CONVERSATION_LOG_CORRELATION_PREFIX)) {
    return row.correlation_id.slice(CONVERSATION_LOG_CORRELATION_PREFIX.length);
  }

  return null;
}

const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const MESSAGE_MIRROR_EVENT_TYPES = new Set([
  EVENT_TYPES.MESSAGE_RECEIVED,
  EVENT_TYPES.MESSAGE_SENT
]);

const COUNTEROFFER_PATTERNS = [
  /^\s*6\??\s*$/i,
  /^\s*what about 6\??\s*$/i,
  /^\s*what about 6:30(?:\s*pm)?\??\s*$/i,
  /prefer(?:\s+it)?\s+at\s+6\b/i,
  /\b6:30\b/i
];

function isMissingRelationError(error) {
  if (!error) {
    return false;
  }

  if (typeof isTableMissingError === "function" && isTableMissingError(error)) {
    return true;
  }

  const code = String(error.code || "");
  const message = String(error.message || error.details || "");

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

function maskProviderMessageId(value) {
  if (!value) {
    return null;
  }

  const text = String(value);

  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`;
  }

  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function formatLocalTimestamp(isoUtc, timezone) {
  const date = new Date(isoUtc);

  if (Number.isNaN(date.getTime())) {
    return {
      timestampUtc: isoUtc || null,
      timestampLocal: null,
      timezone
    };
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const offset = String(parts.timeZoneName || "GMT").replace(/^GMT/, "").replace(/^UTC/, "");
  const normalizedOffset = offset && offset !== "GMT" && offset !== "UTC" ? offset : "+00:00";
  const timestampLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${normalizedOffset}`;

  return {
    timestampUtc: date.toISOString(),
    timestampLocal,
    timezone
  };
}

function detectInboundFlags(text) {
  const flags = [];
  const body = String(text || "");

  if (COUNTEROFFER_PATTERNS.some((pattern) => pattern.test(body))) {
    flags.push("counteroffer");
  }

  if (/^\s*6\??\s*$/i.test(body) || /^\s*what about 6\??\s*$/i.test(body)) {
    flags.push("counteroffer_6");
  }

  if (/6:30/i.test(body)) {
    flags.push("counteroffer_630");
  }

  return flags;
}

function detectOutboundFlags(text) {
  const flags = [];
  const body = String(text || "");

  if (/authenticated agent id|appointment persistence/i.test(body)) {
    flags.push("internal_error_leaked");
  }

  if (/already confirmed/i.test(body)) {
    flags.push("post_confirmation_lock");
  }

  if (/5:00\s*PM/i.test(body) && /5:15\s*PM/i.test(body)) {
    flags.push("repeated_slot_menu");
  }

  if (/quedó confirmada|entrevista por Zoom/i.test(body)) {
    flags.push("spanish_confirmation");
  }

  if (/You're all set|at our office/i.test(body)) {
    flags.push("english_office_confirmation");
  }

  return flags;
}

function annotateSequenceFlags(items) {
  const sorted = [...items].sort((a, b) => {
    const delta =
      new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime();

    if (delta !== 0) {
      return delta;
    }

    return String(a.id).localeCompare(String(b.id));
  });

  let pendingCounteroffer = null;
  let sawEnglishOfficeConfirm = false;
  let sawSpanishZoomConfirm = false;

  for (const item of sorted) {
    const flags = new Set(item.flags || []);

    if (item.direction === "inbound" && flags.has("counteroffer")) {
      pendingCounteroffer = item;
      flags.add("awaiting_counteroffer_handling");
    }

    if (item.direction === "outbound" && pendingCounteroffer) {
      const replyText = String(item.content?.text || "");
      const acknowledgesRequestedTime =
        /\b6:30\b/i.test(replyText) ||
        /\b6(?::00)?\s*(?:pm|p\.m\.)?\b/i.test(replyText);
      const ignored =
        flags.has("repeated_slot_menu") ||
        flags.has("post_confirmation_lock") ||
        (!acknowledgesRequestedTime && !flags.has("internal_error_leaked"));

      if (ignored) {
        flags.add("unhandled");
        flags.add("ignored_counteroffer");
        pendingCounteroffer.flags = [
          ...new Set([
            ...(pendingCounteroffer.flags || []),
            "unhandled",
            "ignored_counteroffer"
          ])
        ];
      }

      if (!flags.has("internal_error_leaked")) {
        pendingCounteroffer = null;
      }
    }

    if (flags.has("english_office_confirmation")) {
      sawEnglishOfficeConfirm = true;
    }

    if (flags.has("spanish_confirmation")) {
      sawSpanishZoomConfirm = true;
    }

    if (
      item.direction === "inbound" &&
      flags.has("counteroffer") &&
      sawEnglishOfficeConfirm
    ) {
      flags.add("no_reschedule_path_candidate");
    }

    if (item.direction === "outbound" && flags.has("post_confirmation_lock")) {
      flags.add("no_reschedule_path");
    }

    item.flags = [...flags];
  }

  if (sawEnglishOfficeConfirm && sawSpanishZoomConfirm) {
    for (const item of sorted) {
      const flags = new Set(item.flags || []);

      if (
        flags.has("english_office_confirmation") ||
        flags.has("spanish_confirmation")
      ) {
        flags.add("dual_confirmation");
        item.flags = [...flags];
      }
    }
  }

  return sorted;
}

function baseItem({
  id,
  eventType,
  category,
  timestampUtc,
  timezone,
  source,
  actor,
  direction,
  channel,
  content,
  delivery,
  ai,
  workflow,
  appointment,
  flags,
  metadata
}) {
  const times = formatLocalTimestamp(timestampUtc, timezone);

  return {
    id,
    eventType,
    category,
    timestampUtc: times.timestampUtc,
    timestampLocal: times.timestampLocal,
    timezone: times.timezone,
    source,
    actor,
    direction: direction || null,
    channel: channel || null,
    content: content || { text: null, redacted: false },
    delivery: delivery || { status: null, providerMessageId: null },
    ai: ai || { intent: null, confidence: null, decisionId: null },
    workflow: workflow || { before: null, after: null },
    appointment: appointment || {
      appointmentId: null,
      action: null,
      status: null
    },
    flags: flags || [],
    metadata: metadata || {}
  };
}

function mapConversationLog(row, context) {
  const message = String(row.message || "");
  const isAgentNote = message.startsWith("[Agent note]");
  const directionRaw = String(row.direction || "").toLowerCase();
  const isInbound = directionRaw === "incoming" || directionRaw === "inbound";
  const direction = isInbound ? "inbound" : "outbound";
  const text = isAgentNote
    ? message.slice("[Agent note]".length).trim()
    : message;
  const flags = isInbound ? detectInboundFlags(text) : detectOutboundFlags(text);

  if (isAgentNote) {
    flags.push("agent_note");
  }

  return baseItem({
    id: `log:${row.id}`,
    eventType: isAgentNote
      ? "note.agent"
      : isInbound
        ? "message.inbound"
        : "message.outbound",
    category: isAgentNote ? "note" : "message",
    timestampUtc: row.created_at,
    timezone: context.timezone,
    source: { system: "conversation_logs", recordId: String(row.id) },
    actor: {
      type: isAgentNote ? "agent" : isInbound ? "prospect" : "atlas",
      displayName: isInbound
        ? context.prospectDisplayName
        : isAgentNote
          ? "Agent"
          : "Atlas Recruit AI",
      userId: null
    },
    direction: isAgentNote ? "system" : direction,
    channel: isAgentNote ? "note" : "whatsapp",
    content: { text, redacted: false },
    ai: {
      intent: row.intent || null,
      confidence: null,
      decisionId: null
    },
    workflow: {
      before: row.current_step || null,
      after: row.current_step || null
    },
    flags,
    metadata: {
      pipeline: row.pipeline || null,
      language: row.language || null,
      organizationIdOnRow: row.organization_id || null
    }
  });
}

function mapDelivery(row, context, linkedLogIds) {
  const linked = row.conversation_log_id
    ? String(row.conversation_log_id)
    : null;

  if (linked && linkedLogIds.has(linked)) {
    return null;
  }

  const status = String(row.status || "");
  const flags = [];

  if (/blocked|suppressed|denied|rejected/i.test(status) || row.retryable === true) {
    flags.push("delivery_attention");
  }

  if (/br-?075|window|template/i.test(String(row.reason || ""))) {
    flags.push("br075_decision");
  }

  return baseItem({
    id: `delivery:${row.id}`,
    eventType: "delivery.outbound",
    category: "delivery",
    timestampUtc: row.created_at || row.updated_at,
    timezone: context.timezone,
    source: {
      system: "whatsapp_outbound_deliveries",
      recordId: String(row.id)
    },
    actor: { type: "system", displayName: "WhatsApp Outbound", userId: null },
    direction: "outbound",
    channel: "whatsapp",
    content: {
      text: row.reason || row.template_key || status || null,
      redacted: false
    },
    delivery: {
      status,
      providerMessageId: maskProviderMessageId(row.provider_message_id)
    },
    ai: { intent: row.intent || null, confidence: null, decisionId: null },
    flags,
    metadata: {
      deliveryMode: row.delivery_mode || null,
      templateKey: row.template_key || null,
      idempotencyKey: row.idempotency_key || null,
      conversationLogId: linked
    }
  });
}

function mapWorkflowEvent(row, context, linkedLogIds) {
  const linked = extractLinkedConversationLogId(row);

  if (
    linked &&
    linkedLogIds.has(String(linked)) &&
    MESSAGE_MIRROR_EVENT_TYPES.has(row.event_type)
  ) {
    return null;
  }

  const payload = row.payload || {};
  const preview =
    payload.bodyPreview ||
    payload.noteText ||
    payload.message ||
    row.event_type;

  return baseItem({
    id: `workflow:${row.id}`,
    eventType: `workflow.${row.event_type}`,
    category: "workflow",
    timestampUtc: row.created_at,
    timezone: context.timezone,
    source: { system: "workflow_events", recordId: String(row.id) },
    actor: {
      type: String(row.actor || "system")
        .toLowerCase()
        .startsWith("agent")
        ? "agent"
        : String(row.actor || "").toLowerCase() === "prospect"
          ? "prospect"
          : "system",
      displayName: row.actor || "system",
      userId: null
    },
    direction: "system",
    channel: payload.channel || null,
    content: { text: String(preview || "").slice(0, 500), redacted: false },
    workflow: {
      before: row.milestone_before || null,
      after: row.milestone_after || null
    },
    flags: [],
    metadata: {
      ownershipBefore: row.ownership_before || null,
      ownershipAfter: row.ownership_after || null,
      correlationId: row.correlation_id || null,
      conversationLogId: linked || null
    }
  });
}

function mapAppointment(appointment, context) {
  const id = appointment.id || appointment.appointmentId;
  const start =
    appointment.startDateTime ||
    appointment.start_date_time ||
    appointment.createdAt ||
    appointment.created_at;

  return baseItem({
    id: `appointment:${id}`,
    eventType: "appointment.record",
    category: "appointment",
    timestampUtc: start,
    timezone: appointment.timezone || context.timezone,
    source: { system: "atlas_appointments", recordId: String(id) },
    actor: { type: "system", displayName: "Appointment System", userId: null },
    direction: "system",
    channel: appointment.meetingType || appointment.meeting_type || null,
    content: {
      text: [
        appointment.status,
        appointment.meetingType || appointment.meeting_type,
        appointment.startDateTime || appointment.start_date_time
      ]
        .filter(Boolean)
        .join(" · "),
      redacted: false
    },
    appointment: {
      appointmentId: String(id),
      action: "persist",
      status: appointment.status || null
    },
    flags: [],
    metadata: {
      calendarEventId: appointment.calendarEventId || appointment.calendar_event_id || null,
      confirmationStatus:
        appointment.confirmationStatus || appointment.confirmation_status || null,
      meetingLocationType:
        appointment.meetingLocationType ||
        appointment.meeting_location_type ||
        null
    }
  });
}

function mapBusinessEvent(row, context) {
  if (!row?.prospect_id && !row?.prospectId) {
    return null;
  }

  return baseItem({
    id: `business:${row.id}`,
    eventType: `business.${row.event_type || row.eventType}`,
    category: "business_event",
    timestampUtc: row.timestamp || row.created_at,
    timezone: context.timezone,
    source: { system: "atlas_business_events", recordId: String(row.id) },
    actor: {
      type: "system",
      displayName: row.actor || "system",
      userId: null
    },
    direction: "system",
    channel: row.channel || null,
    content: {
      text: row.event_type || row.eventType || null,
      redacted: false
    },
    flags: [],
    metadata: { correlationId: row.correlation_id || null }
  });
}

function mapTimelineEntry(row, context) {
  if (!row?.prospect_id && !row?.prospectId) {
    return null;
  }

  return baseItem({
    id: `timeline:${row.id}`,
    eventType: `timeline.${row.entry_type || row.event_type || "entry"}`,
    category: "timeline",
    timestampUtc: row.timestamp || row.created_at,
    timezone: context.timezone,
    source: { system: "atlas_timeline_entries", recordId: String(row.id) },
    actor: {
      type: "system",
      displayName: row.actor || "system",
      userId: null
    },
    direction: "system",
    channel: row.channel || null,
    content: {
      text: row.summary || row.event_type || null,
      redacted: false
    },
    flags: [],
    metadata: {
      businessEventId: row.business_event_id || null,
      lifecycleStateAtEvent: row.lifecycle_state_at_event || null
    }
  });
}

function attachDeliveriesToMessages(items, deliveries) {
  const byLogId = new Map();

  for (const delivery of deliveries) {
    const logId = delivery.conversation_log_id
      ? String(delivery.conversation_log_id)
      : null;

    if (!logId) {
      continue;
    }

    const existing = byLogId.get(logId) || [];
    existing.push(delivery);
    byLogId.set(logId, existing);
  }

  return items.map((item) => {
    if (item.source?.system !== "conversation_logs") {
      return item;
    }

    const rows = byLogId.get(String(item.source.recordId));

    if (!rows?.length) {
      return item;
    }

    const latest = rows[0];
    const flags = new Set(item.flags || []);

    if (/blocked|suppressed|denied|rejected/i.test(String(latest.status || ""))) {
      flags.add("delivery_attention");
    }

    if (/br-?075|window|template/i.test(String(latest.reason || ""))) {
      flags.add("br075_decision");
    }

    return {
      ...item,
      delivery: {
        status: latest.status || null,
        providerMessageId: maskProviderMessageId(latest.provider_message_id)
      },
      flags: [...flags],
      metadata: {
        ...item.metadata,
        deliveryId: latest.id,
        deliveryMode: latest.delivery_mode || null,
        templateKey: latest.template_key || null
      }
    };
  });
}

async function defaultLoadConversationLogs(phone) {
  const { data, error } = await getSupabase()
    .from("conversation_logs")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: true })
    .limit(MAX_LIMIT);

  if (error) {
    throw error;
  }

  return data || [];
}

async function defaultLoadOutboundDeliveries(phone, organizationId) {
  let query = getSupabase()
    .from("whatsapp_outbound_deliveries")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: false })
    .limit(MAX_LIMIT);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }

    throw error;
  }

  return data || [];
}

async function defaultLoadWorkflowEvents(phone) {
  const { data, error } = await getSupabase()
    .from("workflow_events")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: true })
    .limit(MAX_LIMIT);

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }

    throw error;
  }

  return data || [];
}

async function defaultLoadAppointments(phone, organizationId) {
  const result = await getAppointmentRepository().search({
    prospectPhone: phone,
    organizationId,
    limit: 50
  });

  return result.items || [];
}

async function defaultLoadBusinessEvents(prospectId, organizationId) {
  if (!prospectId) {
    return { rows: [], gap: "missing_prospect_id" };
  }

  let query = getSupabase()
    .from("atlas_business_events")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("timestamp", { ascending: true })
    .limit(MAX_LIMIT);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationError(error)) {
      return { rows: [], gap: "atlas_business_events_unavailable" };
    }

    throw error;
  }

  return { rows: data || [], gap: null };
}

async function defaultLoadTimelineEntries(prospectId, organizationId) {
  if (!prospectId) {
    return { rows: [], gap: "missing_prospect_id" };
  }

  let query = getSupabase()
    .from("atlas_timeline_entries")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("timestamp", { ascending: true })
    .limit(MAX_LIMIT);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelationError(error)) {
      return { rows: [], gap: "atlas_timeline_entries_unavailable" };
    }

    throw error;
  }

  return { rows: data || [], gap: null };
}

/**
 * @param {object} input
 * @param {string} input.phone
 * @param {string} [input.organizationId]
 * @param {string} [input.prospectId]
 * @param {string} [input.prospectDisplayName]
 * @param {string} [input.timezone]
 * @param {number} [input.limit]
 * @param {object} [input.loaders] injectable loaders for tests
 */
async function buildCommunicationsCenterTimeline(input = {}) {
  const phone = String(input.phone || "").trim();

  if (!phone) {
    throw new Error("COMMUNICATIONS_CENTER_PHONE_REQUIRED");
  }

  const organizationId = input.organizationId || null;
  const prospectId = input.prospectId || null;
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const limit = Math.min(
    Math.max(Number(input.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const loaders = input.loaders || {};
  const context = {
    timezone,
    prospectDisplayName: input.prospectDisplayName || null
  };

  const gaps = [];

  const [
    conversationLogs,
    deliveries,
    workflowEvents,
    appointments,
    businessResult,
    timelineResult
  ] = await Promise.all([
    (loaders.loadConversationLogs || defaultLoadConversationLogs)(phone),
    (loaders.loadOutboundDeliveries || defaultLoadOutboundDeliveries)(
      phone,
      organizationId
    ),
    (loaders.loadWorkflowEvents || defaultLoadWorkflowEvents)(phone),
    (loaders.loadAppointments || defaultLoadAppointments)(phone, organizationId),
    (loaders.loadBusinessEvents || defaultLoadBusinessEvents)(
      prospectId,
      organizationId
    ),
    (loaders.loadTimelineEntries || defaultLoadTimelineEntries)(
      prospectId,
      organizationId
    )
  ]);

  if (!organizationId) {
    gaps.push({
      code: "organization_id_not_provided",
      detail: "Caller did not supply organization scope; delivery/appointment filters may be broader."
    });
  }

  const nullOrgLogs = conversationLogs.filter((row) => !row.organization_id);

  if (nullOrgLogs.length) {
    gaps.push({
      code: "conversation_logs_missing_organization_id",
      detail: `${nullOrgLogs.length} conversation_logs rows have null organization_id (phone-linked only).`,
      count: nullOrgLogs.length
    });
  }

  if (businessResult.gap) {
    gaps.push({
      code: businessResult.gap,
      detail: "atlas_business_events not included in canonical timeline."
    });
  } else if (!businessResult.rows.length) {
    gaps.push({
      code: "atlas_business_events_empty",
      detail: "No prospect-linked business events in window."
    });
  }

  if (timelineResult.gap) {
    gaps.push({
      code: timelineResult.gap,
      detail: "atlas_timeline_entries not included in canonical timeline."
    });
  } else if (!timelineResult.rows.length) {
    gaps.push({
      code: "atlas_timeline_entries_empty",
      detail: "No prospect-linked timeline projection rows."
    });
  }

  const linkedLogIds = new Set(conversationLogs.map((row) => String(row.id)));

  let items = [
    ...conversationLogs.map((row) => mapConversationLog(row, context)),
    ...deliveries
      .map((row) => mapDelivery(row, context, linkedLogIds))
      .filter(Boolean),
    ...workflowEvents
      .map((row) => mapWorkflowEvent(row, context, linkedLogIds))
      .filter(Boolean),
    ...appointments.map((row) => mapAppointment(row, context)),
    ...businessResult.rows.map((row) => mapBusinessEvent(row, context)).filter(Boolean),
    ...timelineResult.rows.map((row) => mapTimelineEntry(row, context)).filter(Boolean)
  ];

  items = attachDeliveriesToMessages(items, deliveries);
  items = annotateSequenceFlags(items);

  const truncated = items.length > limit;
  const page = truncated ? items.slice(-limit) : items;

  return {
    generatedAt: new Date().toISOString(),
    phoneMasked: maskPhoneLast4(phone),
    organizationId,
    prospectId,
    prospectDisplayName: context.prospectDisplayName,
    timezone,
    sources: {
      conversation_logs: conversationLogs.length,
      whatsapp_outbound_deliveries: deliveries.length,
      workflow_events: workflowEvents.length,
      atlas_appointments: appointments.length,
      atlas_business_events: businessResult.rows.length,
      atlas_timeline_entries: timelineResult.rows.length
    },
    gaps,
    itemCount: page.length,
    truncated,
    items: page
  };
}

function maskPhoneLast4(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length < 4) {
    return "+***";
  }

  return `+***${digits.slice(-4)}`;
}

module.exports = {
  buildCommunicationsCenterTimeline,
  formatLocalTimestamp,
  maskProviderMessageId,
  maskPhoneLast4,
  detectInboundFlags,
  detectOutboundFlags,
  annotateSequenceFlags,
  mapConversationLog,
  mapDelivery,
  mapWorkflowEvent,
  mapAppointment,
  COUNTEROFFER_PATTERNS,
  DEFAULT_TIMEZONE
};
