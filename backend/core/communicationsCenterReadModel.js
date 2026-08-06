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
const {
  maskPhoneLast4,
  maskProviderMessageId
} = require("./communicationsCenterMasks");

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

  if (context.markLegacyPhoneCorrelation) {
    flags.push("legacy_phone_correlation");
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
      organizationIdOnRow: row.organization_id || null,
      correlationTier: context.markLegacyPhoneCorrelation
        ? "authorized_current_phone_fallback"
        : "unknown",
      channelIdentityId: context.channelIdentityId || null,
      conversationId: null
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

function phoneSet(phones = []) {
  return new Set((phones || []).filter(Boolean).map(String));
}

function rowPhoneMatches(rowPhone, authorizedPhones) {
  if (!rowPhone || !authorizedPhones?.size) {
    return false;
  }

  const raw = String(rowPhone);
  if (authorizedPhones.has(raw)) {
    return true;
  }

  const digits = raw.replace(/\D/g, "");
  for (const candidate of authorizedPhones) {
    if (String(candidate).replace(/\D/g, "") === digits) {
      return true;
    }
  }

  return false;
}

function filterPhoneKeyedRows(rows, {
  organizationId,
  authorizedPhones,
  allowNullOrgPhoneFallback,
  stats
}) {
  const kept = [];

  for (const row of rows || []) {
    const rowOrg = row.organization_id || row.organizationId || null;
    const rowProspectId = row.prospect_id || row.prospectId || null;

    if (rowProspectId && stats.authorizedProspectId && String(rowProspectId) !== String(stats.authorizedProspectId)) {
      stats.ambiguousRecordsExcluded += 1;
      continue;
    }

    if (rowOrg && organizationId && String(rowOrg) !== String(organizationId)) {
      stats.unlinkedRecordsExcluded += 1;
      continue;
    }

    if (!rowPhoneMatches(row.prospect_phone || row.prospectPhone, authorizedPhones)) {
      stats.unlinkedRecordsExcluded += 1;
      continue;
    }

    if (!rowOrg) {
      if (!allowNullOrgPhoneFallback) {
        stats.ambiguousRecordsExcluded += 1;
        continue;
      }
    }

    kept.push(row);
  }

  return kept;
}

async function defaultLoadConversationLogs(query) {
  if (!query.phoneFallbackAllowed || !query.authorizedPhones?.length) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("conversation_logs")
    .select("*")
    .in("prospect_phone", query.authorizedPhones)
    .order("created_at", { ascending: true })
    .limit(MAX_LIMIT);

  if (error) {
    throw error;
  }

  return filterPhoneKeyedRows(data || [], {
    organizationId: query.organizationId,
    authorizedPhones: phoneSet(query.authorizedPhones),
    allowNullOrgPhoneFallback: query.allowNullOrgPhoneFallback,
    stats: query.stats
  });
}

async function defaultLoadOutboundDeliveries(query) {
  if (!query.phoneFallbackAllowed || !query.authorizedPhones?.length) {
    return [];
  }

  let dbQuery = getSupabase()
    .from("whatsapp_outbound_deliveries")
    .select("*")
    .in("prospect_phone", query.authorizedPhones)
    .order("created_at", { ascending: false })
    .limit(MAX_LIMIT);

  if (query.organizationId) {
    dbQuery = dbQuery.eq("organization_id", query.organizationId);
  }

  const { data, error } = await dbQuery;

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }

    throw error;
  }

  return filterPhoneKeyedRows(data || [], {
    organizationId: query.organizationId,
    authorizedPhones: phoneSet(query.authorizedPhones),
    allowNullOrgPhoneFallback: false,
    stats: query.stats
  });
}

async function defaultLoadWorkflowEvents(query) {
  if (!query.phoneFallbackAllowed || !query.authorizedPhones?.length) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("workflow_events")
    .select("*")
    .in("prospect_phone", query.authorizedPhones)
    .order("created_at", { ascending: true })
    .limit(MAX_LIMIT);

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }

    throw error;
  }

  return filterPhoneKeyedRows(data || [], {
    organizationId: query.organizationId,
    authorizedPhones: phoneSet(query.authorizedPhones),
    allowNullOrgPhoneFallback: query.allowNullOrgPhoneFallback,
    stats: query.stats
  });
}

async function defaultLoadAppointments(query) {
  const byId = [];

  if (query.prospectId && query.organizationId) {
    const { data, error } = await getSupabase()
      .from("atlas_appointments")
      .select("*")
      .eq("organization_id", query.organizationId)
      .eq("prospect_id", query.prospectId)
      .order("start_date_time", { ascending: true })
      .limit(50);

    if (error) {
      if (!isMissingRelationError(error)) {
        throw error;
      }
    } else {
      byId.push(...(data || []));
    }
  }

  let byPhone = [];

  if (query.phoneFallbackAllowed && query.authorizedPhones?.length) {
    const primaryPhone = query.authorizedPhones[0];
    const result = await getAppointmentRepository().search({
      prospectPhone: primaryPhone,
      organizationId: query.organizationId,
      limit: 50
    });
    byPhone = result.items || [];
  }

  const seen = new Set(byId.map((row) => String(row.id)));
  const merged = [...byId];

  for (const appointment of byPhone) {
    const id = String(appointment.id);
    const appointmentProspectId =
      appointment.prospectId || appointment.prospect_id || null;

    if (appointmentProspectId && String(appointmentProspectId) !== String(query.prospectId)) {
      query.stats.ambiguousRecordsExcluded += 1;
      continue;
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    merged.push(appointment);
  }

  const { rowToAppointment } = require("./appointmentReadModel");

  return merged.map((row) => {
    if (row.prospectPhone || row.startDateTime) {
      return row;
    }

    return rowToAppointment(row);
  });
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

function mapAppointmentWithCorrelation(appointment, context) {
  const item = mapAppointment(appointment, context);
  const appointmentProspectId =
    appointment.prospectId || appointment.prospect_id || null;
  const flags = new Set(item.flags || []);
  let correlationTier = "appointment_linked_to_prospect";

  if (appointmentProspectId && String(appointmentProspectId) === String(context.prospectId)) {
    correlationTier = "explicit_prospect_id";
  } else {
    flags.add("legacy_phone_correlation");
    correlationTier = "authorized_current_phone_fallback";
  }

  return {
    ...item,
    flags: [...flags],
    metadata: {
      ...item.metadata,
      correlationTier,
      channelIdentityId: context.channelIdentityId || null
    }
  };
}

/**
 * Prospect-canonical Communications Center timeline.
 * Phone is contact-channel metadata only — never an authorization key.
 *
 * @param {object} input
 * @param {string} input.prospectId
 * @param {string} input.organizationId
 * @param {object} [input.prospect]
 * @param {object[]} [input.channelIdentities]
 * @param {string[]} [input.authorizedPhones]
 * @param {boolean} [input.phoneFallbackAllowed]
 * @param {boolean} [input.allowNullOrgPhoneFallback]
 * @param {object} [input.phoneSafety]
 * @param {object} [input.loaders]
 */
async function buildCommunicationsCenterTimeline(input = {}) {
  const prospectId = String(input.prospectId || "").trim();

  if (!prospectId) {
    throw new Error("COMMUNICATIONS_CENTER_PROSPECT_ID_REQUIRED");
  }

  const organizationId = input.organizationId || null;

  if (!organizationId) {
    throw new Error("COMMUNICATIONS_CENTER_ORGANIZATION_REQUIRED");
  }

  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const limit = Math.min(
    Math.max(Number(input.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const loaders = input.loaders || {};
  const channelIdentities = input.channelIdentities || [];
  const authorizedPhones = input.authorizedPhones || [];
  const phoneFallbackAllowed = input.phoneFallbackAllowed !== false && authorizedPhones.length > 0;
  const allowNullOrgPhoneFallback = Boolean(input.allowNullOrgPhoneFallback);
  const currentIdentity = channelIdentities.find((identity) => identity.isCurrent) || channelIdentities[0] || null;
  const stats = {
    authorizedProspectId: prospectId,
    legacyPhoneCorrelations: 0,
    ambiguousRecordsExcluded: 0,
    unlinkedRecordsExcluded: 0
  };

  const gaps = [];
  const context = {
    timezone,
    prospectDisplayName: input.prospectDisplayName || null,
    prospectId,
    markLegacyPhoneCorrelation: phoneFallbackAllowed,
    channelIdentityId: currentIdentity?.channelIdentityId || null
  };

  const phoneQuery = {
    prospectId,
    organizationId,
    authorizedPhones,
    phoneFallbackAllowed,
    allowNullOrgPhoneFallback,
    stats
  };

  if (!phoneFallbackAllowed) {
    gaps.push({
      code: "phone_fallback_disabled",
      detail:
        input.phoneSafety?.reason ||
        "Authorized current-phone fallback disabled due to ambiguity or missing contact identity."
    });
  }

  gaps.push({
    code: "historical_channel_identity_unavailable",
    detail:
      "Atlas does not yet retain prior phone/channel identities. Old-phone history cannot be recovered reliably after a number change."
  });

  const [
    conversationLogs,
    deliveries,
    workflowEvents,
    appointments,
    businessResult,
    timelineResult
  ] = await Promise.all([
    (loaders.loadConversationLogs || defaultLoadConversationLogs)(phoneQuery),
    (loaders.loadOutboundDeliveries || defaultLoadOutboundDeliveries)(phoneQuery),
    (loaders.loadWorkflowEvents || defaultLoadWorkflowEvents)(phoneQuery),
    (loaders.loadAppointments || defaultLoadAppointments)(phoneQuery),
    (loaders.loadBusinessEvents || defaultLoadBusinessEvents)(
      prospectId,
      organizationId
    ),
    (loaders.loadTimelineEntries || defaultLoadTimelineEntries)(
      prospectId,
      organizationId
    )
  ]);

  const nullOrgLogs = conversationLogs.filter((row) => !row.organization_id);

  if (nullOrgLogs.length) {
    gaps.push({
      code: "conversation_logs_missing_organization_id",
      detail: `${nullOrgLogs.length} conversation_logs rows have null organization_id (phone-correlated only).`,
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
      detail: "No prospect-linked business events."
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
      .map((row) => {
        const item = mapDelivery(row, context, linkedLogIds);
        if (!item) {
          return null;
        }
        const flags = new Set(item.flags || []);
        flags.add("legacy_phone_correlation");
        return {
          ...item,
          flags: [...flags],
          metadata: {
            ...item.metadata,
            correlationTier: "authorized_current_phone_fallback",
            channelIdentityId: context.channelIdentityId
          }
        };
      })
      .filter(Boolean),
    ...workflowEvents
      .map((row) => {
        const item = mapWorkflowEvent(row, context, linkedLogIds);
        if (!item) {
          return null;
        }
        const flags = new Set(item.flags || []);
        flags.add("legacy_phone_correlation");
        return {
          ...item,
          flags: [...flags],
          metadata: {
            ...item.metadata,
            correlationTier: "authorized_current_phone_fallback",
            channelIdentityId: context.channelIdentityId
          }
        };
      })
      .filter(Boolean),
    ...appointments.map((row) => mapAppointmentWithCorrelation(row, context)),
    ...businessResult.rows
      .map((row) => {
        const item = mapBusinessEvent(row, context);
        if (!item) {
          return null;
        }
        return {
          ...item,
          metadata: {
            ...item.metadata,
            correlationTier: "explicit_prospect_id"
          }
        };
      })
      .filter(Boolean),
    ...timelineResult.rows
      .map((row) => {
        const item = mapTimelineEntry(row, context);
        if (!item) {
          return null;
        }
        return {
          ...item,
          metadata: {
            ...item.metadata,
            correlationTier: "explicit_prospect_id"
          }
        };
      })
      .filter(Boolean)
  ];

  items = attachDeliveriesToMessages(items, deliveries);
  items = annotateSequenceFlags(items);

  for (const item of items) {
    if ((item.flags || []).includes("legacy_phone_correlation")) {
      stats.legacyPhoneCorrelations += 1;
    }
  }

  const truncated = items.length > limit;
  const page = truncated ? items.slice(-limit) : items;

  return {
    generatedAt: new Date().toISOString(),
    prospect: {
      id: prospectId,
      displayName: context.prospectDisplayName,
      preferredLanguage: input.preferredLanguage || null,
      currentContact: currentIdentity
        ? {
            channel: currentIdentity.channel,
            maskedAddress: currentIdentity.maskedAddress
          }
        : null
    },
    channelIdentities: input.publicChannelIdentities || [],
    organizationId,
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
    items: page,
    pagination: {
      nextCursor: null,
      hasMore: truncated
    },
    dataQuality: {
      legacyPhoneCorrelations: stats.legacyPhoneCorrelations,
      ambiguousRecordsExcluded: stats.ambiguousRecordsExcluded,
      unlinkedRecordsExcluded: stats.unlinkedRecordsExcluded
    }
  };
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
  filterPhoneKeyedRows,
  COUNTEROFFER_PATTERNS,
  DEFAULT_TIMEZONE
};
