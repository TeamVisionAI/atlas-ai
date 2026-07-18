/**
 * Sprint 8A.1 — Persists structured workflow events to Supabase workflow_events.
 * Gracefully degrades if the table has not been migrated yet (logs warning, no throw).
 */

const { supabase } = require("./supabaseService");

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

  const { data, error } = await supabase
    .from("workflow_events")
    .insert([row])
    .select()
    .single();

  if (error) {
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
    return { success: false, error: error.message };
  }

  return { success: true, event: data };
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
  listWorkflowEvents,
  listRecentWorkflowEvents
};
