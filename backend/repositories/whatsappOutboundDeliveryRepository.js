/**
 * Durable WhatsApp outbound delivery attempts (BR-075).
 */

const { supabase } = require("../services/supabaseService");

const SUCCESS_STATUSES = new Set(["sent_freeform", "sent_template"]);

async function findSuccessfulDeliveryByIdempotencyKey({
  organizationId,
  idempotencyKey,
  client = supabase
}) {
  if (!idempotencyKey) {
    return null;
  }

  let query = client
    .from("whatsapp_outbound_deliveries")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["sent_freeform", "sent_template"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  if (error) {
    // Table may not exist yet in older environments — fail open to in-process dedupe only.
    if (String(error.message || "").includes("does not exist")) {
      return null;
    }

    throw new Error(`DELIVERY_LOOKUP_FAILED:${error.message}`);
  }

  return Array.isArray(data) ? data[0] || null : data;
}

async function recordOutboundDelivery(record, client = supabase) {
  const row = {
    organization_id: record.organizationId || null,
    prospect_phone: record.prospectPhone,
    intent: record.intent,
    idempotency_key: record.idempotencyKey || null,
    status: record.status,
    delivery_mode: record.deliveryMode || null,
    template_key: record.templateKey || null,
    meta_template_name: record.metaTemplateName || null,
    language: record.language || null,
    retryable: Boolean(record.retryable),
    reason: record.reason || null,
    provider_message_id: record.providerMessageId || null,
    conversation_log_id: record.conversationLogId || null,
    metadata: record.metadata || {},
    updated_at: new Date().toISOString()
  };

  const { data, error } = await client
    .from("whatsapp_outbound_deliveries")
    .insert([row])
    .select()
    .single();

  if (error) {
    if (String(error.message || "").includes("does not exist")) {
      return {
        success: false,
        skipped: true,
        error: "TABLE_MISSING",
        record: row
      };
    }

    // Unique success idempotency conflict → treat as prior success
    if (error.code === "23505" && record.idempotencyKey) {
      const existing = await findSuccessfulDeliveryByIdempotencyKey({
        organizationId: record.organizationId,
        idempotencyKey: record.idempotencyKey,
        client
      });

      return {
        success: true,
        duplicate: true,
        row: existing,
        error: null
      };
    }

    return { success: false, error, row: null };
  }

  return { success: true, row: data, duplicate: false };
}

function isSuccessfulDeliveryStatus(status) {
  return SUCCESS_STATUSES.has(status);
}

module.exports = {
  findSuccessfulDeliveryByIdempotencyKey,
  recordOutboundDelivery,
  isSuccessfulDeliveryStatus,
  SUCCESS_STATUSES
};
