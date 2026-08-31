/**
 * BR-044 / Sprint 8A.2 — bounded org-scoped reads for the Mission Control queue.
 * Replaces per-prospect conversation / workflow / appointment round trips.
 */

const {
  filterConversationLogsForTenant,
  loadProspectPhoneOrgIndex,
  collectPhoneAliases
} = require("./conversationLogTenantScope");
const {
  selectActivePersistedAppointmentForProspect
} = require("./appointmentListQuery");

const CONVERSATION_PHONE_CHUNK = 80;
const CONVERSATION_ROWS_PER_PHONE = 20;

function chunkValues(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

function phoneLookupKeys(phone) {
  return collectPhoneAliases(phone);
}

function lookupByPhone(map, phone) {
  if (!map) {
    return undefined;
  }
  for (const key of phoneLookupKeys(phone)) {
    if (map.has(key)) {
      return map.get(key);
    }
  }
  return undefined;
}

function messageHintsFromLogs(logs = []) {
  const ordered = [...logs].sort(
    (left, right) => Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0)
  );
  let lastOutboundAt = null;
  let lastInboundAt = null;

  for (const row of ordered) {
    const direction = String(row.direction || "").toLowerCase();
    if (!lastOutboundAt && (direction === "outgoing" || direction === "outbound")) {
      lastOutboundAt = row.created_at;
    }
    if (!lastInboundAt && (direction === "incoming" || direction === "inbound")) {
      lastInboundAt = row.created_at;
    }
    if (lastOutboundAt && lastInboundAt) {
      break;
    }
  }

  return { lastOutboundAt, lastInboundAt };
}

function groupLogsByPhone(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const phone = row.prospect_phone || row.prospectPhone;
    if (!phone) {
      continue;
    }
    const list = grouped.get(phone) || [];
    list.push(row);
    grouped.set(phone, list);
    for (const alias of phoneLookupKeys(phone)) {
      if (!grouped.has(alias)) {
        grouped.set(alias, list);
      }
    }
  }
  return grouped;
}

function indexAppointmentsByPhone(items = []) {
  const grouped = new Map();
  for (const appointment of items || []) {
    const phone = appointment.prospectPhone || appointment.prospect_phone;
    if (!phone) {
      continue;
    }
    const list = grouped.get(phone) || [];
    list.push(appointment);
    grouped.set(phone, list);
    for (const alias of phoneLookupKeys(phone)) {
      if (!grouped.has(alias)) {
        grouped.set(alias, list);
      }
    }
  }

  const activeByPhone = new Map();
  const latestByPhone = new Map();
  for (const [phone, list] of grouped.entries()) {
    activeByPhone.set(phone, selectActivePersistedAppointmentForProspect(list));
    const latest = [...list].sort(
      (left, right) =>
        Date.parse(right.updatedAt || right.startDateTime || 0) -
        Date.parse(left.updatedAt || left.startDateTime || 0)
    )[0];
    latestByPhone.set(phone, latest || null);
  }

  return { activeByPhone, latestByPhone };
}

async function queryConversationLogChunk(phones, organizationId, deps = {}) {
  const supabase = deps.supabase || require("../services/supabaseService").supabase;
  let query = supabase
    .from("conversation_logs")
    .select("prospect_phone, direction, created_at, organization_id")
    .in("prospect_phone", phones)
    .order("created_at", { ascending: false })
    .limit(phones.length * CONVERSATION_ROWS_PER_PHONE);

  if (organizationId) {
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Bounded org-scoped batch for queue evaluation.
 * Query count is O(chunks + 2), not O(prospects).
 */
async function loadMissionControlQueueBatch(prospects = [], options = {}) {
  const stats = { conversationQueries: 0, appointmentQueries: 0, phoneIndexQueries: 0 };
  const notify = (key) => {
    stats[key] += 1;
    if (typeof options.onQuery === "function") {
      options.onQuery(key);
    }
  };

  const phones = [
    ...new Set((prospects || []).map((row) => String(row?.phone || "").trim()).filter(Boolean))
  ];
  const organizationId = options.organizationId || prospects[0]?.organization_id || null;

  if (!phones.length) {
    return {
      logsByPhone: new Map(),
      activeByPhone: new Map(),
      latestByPhone: new Map(),
      organizationId,
      stats
    };
  }

  const fetchLogs =
    options.fetchConversationLogsFn ||
    (async (chunk) => {
      notify("conversationQueries");
      return queryConversationLogChunk(chunk, organizationId, options);
    });
  const loadPhoneIndex =
    options.loadProspectPhoneOrgIndexFn ||
    (async () => {
      notify("phoneIndexQueries");
      return loadProspectPhoneOrgIndex(phones);
    });
  const listAppointments =
    options.listAppointmentsFn ||
    (async () => {
      notify("appointmentQueries");
      const { listPersistedAppointments } = require("../services/appointmentListService");
      return listPersistedAppointments({ organizationId });
    });

  const chunks = chunkValues(phones, CONVERSATION_PHONE_CHUNK);
  const [logChunks, orgsByAlias, appointmentResult] = await Promise.all([
    Promise.all(
      chunks.map((chunk) =>
        fetchLogs([...new Set(chunk.flatMap((phone) => phoneLookupKeys(phone)))])
      )
    ),
    organizationId ? loadPhoneIndex() : Promise.resolve(new Map()),
    listAppointments()
  ]);

  const rawLogs = logChunks.flat();
  const scopedLogs = organizationId
    ? filterConversationLogsForTenant(rawLogs, organizationId, orgsByAlias)
    : rawLogs;

  const { activeByPhone, latestByPhone } = indexAppointmentsByPhone(
    appointmentResult?.items || appointmentResult || []
  );

  return {
    logsByPhone: groupLogsByPhone(scopedLogs),
    activeByPhone,
    latestByPhone,
    organizationId,
    stats
  };
}

function estimateLegacyQueueQueries(prospectCount, appointmentLookups = 0) {
  const n = Number(prospectCount) || 0;
  return {
    conversationQueries: n,
    workflowQueries: n * 2,
    appointmentQueries: n + (Number(appointmentLookups) || 0)
  };
}

function estimateBatchedQueueQueries(prospectCount) {
  const n = Number(prospectCount) || 0;
  if (n <= 0) {
    return { conversationQueries: 0, phoneIndexQueries: 0, appointmentQueries: 0 };
  }
  return {
    conversationQueries: Math.ceil(n / CONVERSATION_PHONE_CHUNK),
    phoneIndexQueries: 1,
    appointmentQueries: 1
  };
}

module.exports = {
  CONVERSATION_PHONE_CHUNK,
  CONVERSATION_ROWS_PER_PHONE,
  chunkValues,
  phoneLookupKeys,
  lookupByPhone,
  messageHintsFromLogs,
  groupLogsByPhone,
  indexAppointmentsByPhone,
  loadMissionControlQueueBatch,
  estimateLegacyQueueQueries,
  estimateBatchedQueueQueries
};
