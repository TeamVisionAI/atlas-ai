/**
 * Durable WhatsApp outbound delivery attempts (BR-075) + Meta lifecycle (observability).
 * BR-075 `status` and Meta `meta_delivery_status` are distinct columns — never conflate.
 */

const { supabase } = require("../services/supabaseService");
const {
  planMetaDeliveryLifecycleUpdate
} = require("../core/whatsappMetaDeliveryLifecycle");
const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");

const SUCCESS_STATUSES = new Set(["sent_freeform", "sent_template"]);

function isTableMissingError(error) {
  const message = String(error?.message || error?.details || error || "");
  const code = String(error?.code || "");

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message) ||
    /schema cache/i.test(message)
  );
}

function isMetaLifecycleColumnError(error) {
  return /meta_delivery_status|sent_at|delivered_at|read_at|failed_at|failure_code|failure_reason/i.test(
    String(error?.message || error?.details || "")
  );
}

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
    // Table may not exist yet during migration/deploy skew — continue without durable dedupe.
    if (isTableMissingError(error)) {
      return null;
    }

    throw new Error(`DELIVERY_LOOKUP_FAILED:${error.message}`);
  }

  return Array.isArray(data) ? data[0] || null : data;
}

async function findDeliveryByProviderMessageId(providerMessageId, client = supabase) {
  const wamid = String(providerMessageId || "").trim();
  if (!wamid) {
    return null;
  }

  const { data, error } = await client
    .from("whatsapp_outbound_deliveries")
    .select("*")
    .eq("provider_message_id", wamid)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw new Error(`DELIVERY_LOOKUP_BY_WAMID_FAILED:${error.message}`);
  }

  return Array.isArray(data) ? data[0] || null : data;
}

/**
 * Link conversation_log_id onto an existing outbound delivery (exact id or wamid).
 * Does not insert a second row.
 */
async function linkOutboundDeliveryConversationLog(
  { deliveryId = null, providerMessageId = null, conversationLogId },
  client = supabase
) {
  const logId = conversationLogId ? String(conversationLogId) : "";
  if (!logId) {
    return { success: false, reason: "MISSING_CONVERSATION_LOG_ID" };
  }

  const patch = {
    conversation_log_id: logId,
    updated_at: new Date().toISOString()
  };

  let query = client.from("whatsapp_outbound_deliveries").update(patch);

  if (deliveryId) {
    query = query.eq("id", deliveryId);
  } else if (providerMessageId) {
    query = query.eq("provider_message_id", String(providerMessageId).trim());
  } else {
    return { success: false, reason: "MISSING_DELIVERY_KEY" };
  }

  const { data, error } = await query.select().limit(1);

  if (error) {
    if (isTableMissingError(error)) {
      return { success: false, skipped: true, reason: "TABLE_MISSING" };
    }
    throw new Error(`DELIVERY_LOG_LINK_FAILED:${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] || null : data;
  if (!row) {
    return { success: false, reason: "DELIVERY_NOT_FOUND" };
  }

  return { success: true, row };
}

async function recordOutboundDelivery(record, client = supabase) {
  const nowIso = new Date().toISOString();
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
    updated_at: nowIso
  };

  // Initial Meta lifecycle when Graph API accepted the send (observability only).
  if (
    record.providerMessageId &&
    (record.status === "sent_freeform" || record.status === "sent_template")
  ) {
    row.meta_delivery_status = "sent";
    row.sent_at = nowIso;
  }

  const { data, error } = await client
    .from("whatsapp_outbound_deliveries")
    .insert([row])
    .select()
    .single();

  if (error) {
    if (isTableMissingError(error)) {
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

    // Pre-migration deploy skew: retry without new columns.
    if (isMetaLifecycleColumnError(error)) {
      const legacyRow = { ...row };
      delete legacyRow.meta_delivery_status;
      delete legacyRow.sent_at;
      const retry = await client
        .from("whatsapp_outbound_deliveries")
        .insert([legacyRow])
        .select()
        .single();
      if (!retry.error) {
        return { success: true, row: retry.data, duplicate: false };
      }
    }

    return { success: false, error, row: null };
  }

  return { success: true, row: data, duplicate: false };
}

/**
 * Apply one Meta status webhook item by exact wamid.
 * Observability only — no ownership / follow-up / retry side effects.
 * @param {Object} event
 * @param {Object} [client]
 * @param {{ quietUnknownLog?: boolean }} [options]
 */
async function applyMetaDeliveryStatusEvent(event, client = supabase, options = {}) {
  const providerMessageId = String(event?.providerMessageId || "").trim();
  if (!providerMessageId) {
    logWhatsAppStage("meta_delivery_status_ignored", {
      reason: "MISSING_PROVIDER_MESSAGE_ID"
    });
    return { success: false, ignored: true, reason: "MISSING_PROVIDER_MESSAGE_ID" };
  }

  const existing = await findDeliveryByProviderMessageId(providerMessageId, client);

  if (!existing) {
    if (!options.quietUnknownLog) {
      logWhatsAppStage("meta_delivery_status_unknown_wamid", {
        providerMessageId,
        status: event.status || null
      });
    }
    return {
      success: true,
      ignored: true,
      reason: "UNKNOWN_WAMID",
      providerMessageId
    };
  }

  const merge = planMetaDeliveryLifecycleUpdate(existing, event);
  if (!merge.apply) {
    logWhatsAppStage("meta_delivery_status_ignored", {
      providerMessageId,
      reason: merge.reason,
      status: event.status || null
    });
    return { success: false, ignored: true, reason: merge.reason, providerMessageId };
  }

  const { data, error } = await client
    .from("whatsapp_outbound_deliveries")
    .update(merge.patch)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    if (isTableMissingError(error)) {
      return { success: false, skipped: true, reason: "TABLE_MISSING" };
    }
    if (isMetaLifecycleColumnError(error)) {
      logWhatsAppStage("meta_delivery_status_schema_pending", {
        providerMessageId,
        level: "warn"
      });
      return { success: false, skipped: true, reason: "SCHEMA_PENDING" };
    }
    throw new Error(`META_DELIVERY_UPDATE_FAILED:${error.message}`);
  }

  logWhatsAppStage("meta_delivery_status_applied", {
    providerMessageId,
    status: merge.patch.meta_delivery_status || existing.meta_delivery_status,
    deliveryId: existing.id
  });

  return {
    success: true,
    ignored: false,
    row: data,
    previous: existing,
    patch: merge.patch
  };
}

function isSuccessfulDeliveryStatus(status) {
  return SUCCESS_STATUSES.has(status);
}

module.exports = {
  findSuccessfulDeliveryByIdempotencyKey,
  findDeliveryByProviderMessageId,
  recordOutboundDelivery,
  linkOutboundDeliveryConversationLog,
  applyMetaDeliveryStatusEvent,
  isSuccessfulDeliveryStatus,
  isTableMissingError,
  SUCCESS_STATUSES
};
