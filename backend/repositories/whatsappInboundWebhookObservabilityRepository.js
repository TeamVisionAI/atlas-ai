/**
 * Durable storage for sanitized inbound WhatsApp webhook observability snapshots.
 */

const { supabase } = require("../services/supabaseService");

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

async function insertSnapshot(row, client = supabase) {
  const { data, error } = await client
    .from("whatsapp_inbound_webhook_observability")
    .insert([row])
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

  return { ok: true, row: data };
}

async function findByProviderMessageId(providerMessageId, client = supabase) {
  const id = String(providerMessageId || "").trim();
  if (!id) {
    return null;
  }

  const { data, error } = await client
    .from("whatsapp_inbound_webhook_observability")
    .select("*")
    .eq("provider_message_id", id)
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw error;
  }

  return data || null;
}

async function linkSnapshot(
  providerMessageId,
  patch,
  client = supabase
) {
  const id = String(providerMessageId || "").trim();
  if (!id) {
    return { ok: false, reason: "MISSING_PROVIDER_MESSAGE_ID" };
  }

  const updates = {
    updated_at: new Date().toISOString(),
    linked_at: new Date().toISOString()
  };

  for (const key of [
    "organization_id",
    "prospect_id",
    "conversation_log_id",
    "owner_user_id",
    "prospect_phone"
  ]) {
    if (patch[key] !== undefined && patch[key] !== null) {
      updates[key] = patch[key];
    }
  }

  const { data, error } = await client
    .from("whatsapp_inbound_webhook_observability")
    .update(updates)
    .eq("provider_message_id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error)) {
      return { ok: false, reason: "TABLE_UNAVAILABLE", error };
    }
    return { ok: false, reason: "UPDATE_FAILED", error };
  }

  return { ok: Boolean(data), row: data || null };
}

async function searchSnapshots(filters = {}, client = supabase) {
  let query = client
    .from("whatsapp_inbound_webhook_observability")
    .select("*")
    .order("received_at", { ascending: false });

  if (filters.organizationId) {
    query = query.eq("organization_id", filters.organizationId);
  }
  if (filters.providerMessageId) {
    query = query.eq("provider_message_id", filters.providerMessageId);
  }
  if (filters.prospectId) {
    query = query.eq("prospect_id", filters.prospectId);
  }
  if (filters.phone) {
    query = query.eq("prospect_phone", filters.phone);
  }
  if (filters.since) {
    query = query.gte("received_at", filters.since);
  }
  if (filters.until) {
    query = query.lte("received_at", filters.until);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw error;
  }

  return data || [];
}

async function purgeOlderThan(cutoffIso, client = supabase) {
  const { data, error } = await client
    .from("whatsapp_inbound_webhook_observability")
    .delete()
    .lt("received_at", cutoffIso)
    .select("id");

  if (error) {
    if (isTableMissingError(error)) {
      return { deleted: 0, reason: "TABLE_UNAVAILABLE" };
    }
    throw error;
  }

  return { deleted: Array.isArray(data) ? data.length : 0 };
}

module.exports = {
  insertSnapshot,
  findByProviderMessageId,
  linkSnapshot,
  searchSnapshots,
  purgeOlderThan,
  isTableMissingError,
  isUniqueViolation
};
