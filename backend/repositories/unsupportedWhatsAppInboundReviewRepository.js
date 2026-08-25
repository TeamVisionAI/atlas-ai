/**
 * BR-156 — Durable unsupported WhatsApp inbound review records.
 */

const { supabase } = require("../services/supabaseService");
const { REVIEW_STATUS } = require("../core/unsupportedWhatsAppInboundReview/constants");

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

function isUniqueViolation(error) {
  return String(error?.code || "") === "23505";
}

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    reviewType: row.review_type,
    organizationId: row.organization_id,
    prospectId: row.prospect_id,
    ownerUserId: row.owner_user_id,
    assignedOwnerUserId: row.assigned_owner_user_id,
    senderPhoneE164: row.sender_phone_e164,
    whatsappSenderId: row.whatsapp_sender_id,
    prospectName: row.prospect_name,
    providerMessageId: row.provider_message_id,
    destinationPhoneNumberId: row.destination_phone_number_id,
    destinationDisplayPhoneNumber: row.destination_display_phone_number,
    metaErrorCode: row.meta_error_code,
    metaErrorTitle: row.meta_error_title,
    status: row.status,
    observabilityId: row.observability_id,
    conversationLogId: row.conversation_log_id,
    correlationId: row.correlation_id,
    receivedAt: row.received_at,
    reviewedAt: row.reviewed_at,
    reviewedByUserId: row.reviewed_by_user_id,
    recoveryCampaignCode: row.recovery_campaign_code,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInsertRow(input) {
  return {
    review_type: input.reviewType,
    organization_id: input.organizationId,
    prospect_id: input.prospectId,
    owner_user_id: input.ownerUserId || null,
    assigned_owner_user_id: input.assignedOwnerUserId || input.ownerUserId || null,
    sender_phone_e164: input.senderPhoneE164,
    whatsapp_sender_id: input.whatsappSenderId || null,
    prospect_name: input.prospectName || null,
    provider_message_id: input.providerMessageId,
    destination_phone_number_id: input.destinationPhoneNumberId,
    destination_display_phone_number: input.destinationDisplayPhoneNumber || null,
    meta_error_code: input.metaErrorCode,
    meta_error_title: input.metaErrorTitle || null,
    status: input.status || REVIEW_STATUS.PENDING_REVIEW,
    observability_id: input.observabilityId || null,
    conversation_log_id: input.conversationLogId || null,
    correlation_id: input.correlationId || null,
    received_at: input.receivedAt,
    metadata: input.metadata || {}
  };
}

async function insertReview(input, client = supabase) {
  const { data, error } = await client
    .from("unsupported_whatsapp_inbound_reviews")
    .insert([toInsertRow(input)])
    .select("*")
    .single();

  if (error) {
    if (isTableMissingError(error)) {
      return { ok: false, reason: "TABLE_UNAVAILABLE", error };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "DUPLICATE_PROVIDER_MESSAGE", error };
    }
    return { ok: false, reason: "INSERT_FAILED", error };
  }

  return { ok: true, row: mapRow(data) };
}

async function findById(id, organizationId, client = supabase) {
  if (!id || !organizationId) {
    return null;
  }

  const { data, error } = await client
    .from("unsupported_whatsapp_inbound_reviews")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw error;
  }

  return mapRow(data);
}

async function findByProviderMessageId(providerMessageId, client = supabase) {
  const id = String(providerMessageId || "").trim();
  if (!id) {
    return null;
  }

  const { data, error } = await client
    .from("unsupported_whatsapp_inbound_reviews")
    .select("*")
    .eq("provider_message_id", id)
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw error;
  }

  return mapRow(data);
}

async function findPendingByProspectId(prospectId, organizationId, client = supabase) {
  const { data, error } = await client
    .from("unsupported_whatsapp_inbound_reviews")
    .select("*")
    .eq("prospect_id", prospectId)
    .eq("organization_id", organizationId)
    .eq("status", REVIEW_STATUS.PENDING_REVIEW)
    .order("received_at", { ascending: false });

  if (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw error;
  }

  return (data || []).map(mapRow);
}

async function listPendingForOrganization(
  { organizationId, assignedOwnerUserId = null, limit = 20 } = {},
  client = supabase
) {
  let query = client
    .from("unsupported_whatsapp_inbound_reviews")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", REVIEW_STATUS.PENDING_REVIEW)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (assignedOwnerUserId) {
    query = query.eq("assigned_owner_user_id", assignedOwnerUserId);
  }

  const { data, error } = await query;

  if (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw error;
  }

  return (data || []).map(mapRow);
}

async function updateReview(id, patch, client = supabase) {
  const updates = {
    updated_at: new Date().toISOString()
  };

  for (const [key, column] of [
    ["status", "status"],
    ["reviewedAt", "reviewed_at"],
    ["reviewedByUserId", "reviewed_by_user_id"],
    ["recoveryCampaignCode", "recovery_campaign_code"],
    ["metadata", "metadata"]
  ]) {
    if (patch[key] !== undefined) {
      updates[column] = patch[key];
    }
  }

  const { data, error } = await client
    .from("unsupported_whatsapp_inbound_reviews")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error)) {
      return { ok: false, reason: "TABLE_UNAVAILABLE", error };
    }
    return { ok: false, reason: "UPDATE_FAILED", error };
  }

  return { ok: true, row: mapRow(data) };
}

function createMemoryUnsupportedWhatsAppInboundReviewRepository(initialRows = []) {
  const rows = new Map();

  for (const row of initialRows) {
    rows.set(row.provider_message_id || row.providerMessageId, mapRow(row));
  }

  return {
    async insertReview(input) {
      const providerMessageId = String(input.providerMessageId || "").trim();
      if (rows.has(providerMessageId)) {
        return { ok: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      const row = mapRow({
        id: input.id || require("crypto").randomUUID(),
        ...toInsertRow(input),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      rows.set(providerMessageId, row);
      return { ok: true, row };
    },
    async findById(id, organizationId) {
      return (
        [...rows.values()].find(
          (row) => row.id === id && row.organizationId === organizationId
        ) || null
      );
    },
    async findByProviderMessageId(providerMessageId) {
      return rows.get(String(providerMessageId || "").trim()) || null;
    },
    async findPendingByProspectId(prospectId, organizationId) {
      return [...rows.values()].filter(
        (row) =>
          row.prospectId === prospectId &&
          row.organizationId === organizationId &&
          row.status === REVIEW_STATUS.PENDING_REVIEW
      );
    },
    async listPendingForOrganization({ organizationId, assignedOwnerUserId = null, limit = 20 }) {
      return [...rows.values()]
        .filter(
          (row) =>
            row.organizationId === organizationId &&
            row.status === REVIEW_STATUS.PENDING_REVIEW &&
            (!assignedOwnerUserId || row.assignedOwnerUserId === assignedOwnerUserId)
        )
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
        .slice(0, limit);
    },
    async updateReview(id, patch) {
      const existing = [...rows.values()].find((row) => row.id === id);
      if (!existing) {
        return { ok: false, reason: "NOT_FOUND" };
      }
      const updated = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      rows.set(existing.providerMessageId, updated);
      return { ok: true, row: updated };
    },
    _rows: rows
  };
}

module.exports = {
  insertReview,
  findById,
  findByProviderMessageId,
  findPendingByProspectId,
  listPendingForOrganization,
  updateReview,
  createMemoryUnsupportedWhatsAppInboundReviewRepository,
  mapRow
};
