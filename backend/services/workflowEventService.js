/**
 * Sprint 8A.1 — Persists structured workflow events to Supabase workflow_events.
 * Gracefully degrades if the table has not been migrated yet (logs warning, no throw).
 */

const { supabase } = require("./supabaseService");
const { EVENT_TYPES } = require("../core/workflowConstants");
const {
  isUniqueViolation,
  isWhatsAppInboundClaimCorrelationId
} = require("../core/whatsappInboundClaim");

let workflowEventsTableAvailable = true;

/**
 * @param {Object} event
 * @returns {Promise<{ success: boolean, event?: Object, error?: string }>}
 */
async function insertWorkflowEvent(event) {
  if (!workflowEventsTableAvailable) {
    return { success: false, error: "WORKFLOW_EVENTS_TABLE_UNAVAILABLE" };
  }

  const row = {
    prospect_phone: event.prospectPhone,
    event_type: event.eventType,
    actor: event.actor,
    milestone_before: event.milestoneBefore || null,
    milestone_after: event.milestoneAfter || null,
    ownership_before: event.ownershipBefore || null,
    ownership_after: event.ownershipAfter || null,
    payload: event.payload || {},
    correlation_id: event.correlationId || null
  };

  if (event.organizationId) {
    row.organization_id = event.organizationId;
  }

  const { data, error } = await supabase
    .from("workflow_events")
    .insert([row])
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: error.message, code: error.code || "23505" };
    }

    if (
      error.code === "42P01" ||
      error.message?.includes("workflow_events")
    ) {
      workflowEventsTableAvailable = false;
      console.warn(
        "[workflowEventService] workflow_events table not found — run backend/database/migrations/001_workflow_foundation.sql"
      );
      return { success: false, error: "WORKFLOW_EVENTS_TABLE_UNAVAILABLE" };
    }

    console.error("[workflowEventService] insert error:", error.message);
    return { success: false, error: error.message, code: error.code || null };
  }

  return { success: true, event: data };
}

/**
 * Prefer the earliest row when historical duplicates exist.
 * Never throws on multiple matches.
 */
function pickCanonicalWorkflowEvent(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return [...rows].sort((a, b) => {
    const aMs = Date.parse(a?.created_at || "") || 0;
    const bMs = Date.parse(b?.created_at || "") || 0;
    if (aMs !== bMs) {
      return aMs - bMs;
    }
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0];
}

/**
 * Idempotency lookup for conversation_log dual-write (Sprint 10.2b).
 * limit(1) so historical duplicate correlation_ids cannot throw (PGRST116).
 */
async function findWorkflowEventByCorrelationId(correlationId) {
  if (!correlationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("workflow_events")
    .select("*")
    .eq("correlation_id", correlationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (
      error.code === "42P01" ||
      error.message?.includes("workflow_events")
    ) {
      return null;
    }

    // PGRST116 — multiple rows; should not happen with limit(1), but fail closed to canonical pick.
    if (error.code === "PGRST116" && Array.isArray(error.details)) {
      return pickCanonicalWorkflowEvent(error.details);
    }

    throw error;
  }

  return data || null;
}

/**
 * Atomic WhatsApp inbound claim: INSERT MessageReceived with
 * correlation_id = whatsapp:inbound:{providerMessageId}.
 * Unique conflict → already claimed (side-effect free skip).
 */
async function claimWhatsAppInboundCorrelation({
  correlationId,
  prospectPhone,
  organizationId = null,
  providerMessageId = null
} = {}) {
  const key = String(correlationId || "").trim();
  const phone = String(prospectPhone || "").trim();

  if (!key || !phone) {
    return { claimed: false, reason: "INVALID_CLAIM" };
  }

  if (!isWhatsAppInboundClaimCorrelationId(key)) {
    return { claimed: false, reason: "INVALID_CLAIM" };
  }

  const inserted = await insertWorkflowEvent({
    prospectPhone: phone,
    eventType: EVENT_TYPES.MESSAGE_RECEIVED,
    actor: "prospect",
    organizationId: organizationId || null,
    correlationId: key,
    payload: {
      providerMessageId: providerMessageId || null,
      inboundClaim: true
    }
  });

  if (inserted.success) {
    return { claimed: true, event: inserted.event };
  }

  if (isUniqueViolation({ code: inserted.code, message: inserted.error })) {
    return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
  }

  if (inserted.error === "WORKFLOW_EVENTS_TABLE_UNAVAILABLE") {
    const existing = await findWorkflowEventByCorrelationId(key);
    if (existing) {
      return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
    }
    return { claimed: true, degraded: true, event: null };
  }

  const error = new Error(inserted.error || "INBOUND_CLAIM_FAILED");
  error.code = inserted.code || "INBOUND_CLAIM_FAILED";
  throw error;
}

/**
 * Read workflow events for a prospect (Mission Control / audit).
 */
async function listWorkflowEvents(phone, limit = 50) {
  if (!phone) {
    return [];
  }

  const { data, error } = await supabase
    .from("workflow_events")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit);

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

/**
 * Recent workflow events across all prospects (Executive Dashboard activity feed).
 */
async function listRecentWorkflowEvents(limit = 50) {
  const { data, error } = await supabase
    .from("workflow_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

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

module.exports = {
  insertWorkflowEvent,
  findWorkflowEventByCorrelationId,
  pickCanonicalWorkflowEvent,
  claimWhatsAppInboundCorrelation,
  listWorkflowEvents,
  listRecentWorkflowEvents
};
