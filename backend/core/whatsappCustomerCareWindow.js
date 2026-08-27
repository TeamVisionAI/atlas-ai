/**
 * Canonical WhatsApp customer-care window (BR-075).
 * Window opens only from the latest valid inbound customer message.
 */

const { supabase } = require("../services/supabaseService");
const { normalizePhoneNumber } = require("./phoneNormalizer");
const { resolveStoragePhone } = require("./whatsappProspectResolver");
const { isSyntheticWhatsAppStorageKey } = require("./whatsappSenderIdentity");
const {
  CUSTOMER_CARE_WINDOW_MS,
  WINDOW_SOURCE,
  evaluateCustomerCareWindowFromInboundAt
} = require("./whatsappCustomerCareWindowMath");

function resolvePhoneCandidates(phone) {
  const raw = String(phone || "").trim();
  if (!raw) {
    return [];
  }
  if (isSyntheticWhatsAppStorageKey(raw)) {
    return [raw];
  }
  const normalized = normalizePhoneNumber(raw) || raw.replace(/\D/g, "");
  const storage = resolveStoragePhone(normalized);
  return [...new Set([raw, normalized, storage, `+${normalized}`].filter(Boolean))];
}

async function queryLatestInbound(client, candidates, organizationId = null) {
  let query = client
    .from("conversation_logs")
    .select("created_at, prospect_phone, direction, organization_id")
    .eq("direction", "incoming")
    .in("prospect_phone", candidates)
    .order("created_at", { ascending: false })
    .limit(1);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`INBOUND_TIMESTAMP_LOOKUP_FAILED:${error.message}`);
  }

  return Array.isArray(data) ? data[0] || null : data;
}

async function fetchLatestInboundConversationTimestamp({
  phone,
  organizationId = null,
  client = supabase
} = {}) {
  const candidates = resolvePhoneCandidates(phone);

  if (!candidates.length) {
    return null;
  }

  // Prefer tenant-scoped inbound rows; fall back to phone-scoped logs when
  // historical conversation_logs rows predate organization_id backfill.
  let row = null;

  if (organizationId) {
    row = await queryLatestInbound(client, candidates, organizationId);
  }

  if (!row?.created_at) {
    row = await queryLatestInbound(client, candidates, null);
  }

  if (!row?.created_at) {
    return null;
  }

  return {
    latestInboundAt: row.created_at,
    prospectPhone: row.prospect_phone,
    organizationId: row.organization_id || organizationId || null
  };
}

async function evaluateCustomerCareWindow({
  phone,
  organizationId = null,
  now = new Date(),
  fetchLatestInbound = fetchLatestInboundConversationTimestamp
} = {}) {
  const inbound = await fetchLatestInbound({ phone, organizationId });
  const evaluation = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: inbound?.latestInboundAt || null,
    now,
    windowMs: CUSTOMER_CARE_WINDOW_MS
  });

  return {
    ...evaluation,
    prospectPhone: inbound?.prospectPhone || phone || null,
    organizationId: inbound?.organizationId || organizationId || null
  };
}

module.exports = {
  CUSTOMER_CARE_WINDOW_MS,
  WINDOW_SOURCE,
  evaluateCustomerCareWindowFromInboundAt,
  fetchLatestInboundConversationTimestamp,
  evaluateCustomerCareWindow,
  resolvePhoneCandidates
};
