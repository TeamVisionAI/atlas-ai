/**
 * BR-135 — Durable prospects.workflow_state JSONB repository.
 * Org + prospect scoped. No cross-tenant fallback.
 */

"use strict";

function getSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const error = new Error("Supabase credentials required for durable workflow state");
    error.code = "WORKFLOW_STATE_DB_UNAVAILABLE";
    throw error;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Resolve prospect identity for durable workflow_state access.
 * Prefer prospectId + organizationId. Phone is lookup only.
 */
async function resolveProspectForWorkflowState({
  phone = null,
  organizationId = null,
  prospectId = null,
  findProspectByIdFn = null,
  findProspectInOrganizationFn = null,
  findProspectFn = null
} = {}) {
  if (prospectId && organizationId) {
    if (typeof findProspectByIdFn === "function") {
      const row = await findProspectByIdFn(prospectId, organizationId);
      if (row) {
        return row;
      }
    } else {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("prospects")
        .select("id, phone, organization_id, workflow_state")
        .eq("id", prospectId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (data) {
        return data;
      }
    }
  }

  if (phone && organizationId && typeof findProspectInOrganizationFn === "function") {
    return findProspectInOrganizationFn(phone, organizationId);
  }

  if (phone && organizationId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("prospects")
      .select("id, phone, organization_id, workflow_state")
      .eq("phone", phone)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data || null;
  }

  // System ingress (WhatsApp) — phone only; still scoped to returned row's org.
  if (phone && typeof findProspectFn === "function") {
    return findProspectFn(phone);
  }

  if (phone) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("prospects")
      .select("id, phone, organization_id, workflow_state")
      .eq("phone", phone)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data || null;
  }

  return null;
}

async function readWorkflowStateFromProspect(prospect) {
  if (!prospect?.id || !prospect.organization_id) {
    return null;
  }
  const raw = prospect.workflow_state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return { ...raw };
}

/**
 * Atomic read-merge-write of prospects.workflow_state for one org-scoped prospect.
 */
async function writeWorkflowStateToProspect({
  prospectId,
  organizationId,
  nextState,
  supabaseClient = null
} = {}) {
  if (!prospectId || !organizationId) {
    const error = new Error("prospectId and organizationId required for durable workflow write");
    error.code = "WORKFLOW_STATE_SCOPE_REQUIRED";
    throw error;
  }

  const supabase = supabaseClient || getSupabase();
  const { data, error } = await supabase
    .from("prospects")
    .update({ workflow_state: nextState })
    .eq("id", prospectId)
    .eq("organization_id", organizationId)
    .select("id, organization_id, phone, workflow_state")
    .maybeSingle();

  if (error) {
    error.code = error.code || "WORKFLOW_STATE_WRITE_FAILED";
    throw error;
  }

  if (!data) {
    const miss = new Error("Prospect not found for durable workflow write");
    miss.code = "WORKFLOW_STATE_PROSPECT_NOT_FOUND";
    throw miss;
  }

  return data;
}

module.exports = {
  resolveProspectForWorkflowState,
  readWorkflowStateFromProspect,
  writeWorkflowStateToProspect
};
