/**
 * BR-074 — Persistence for firm-verified securities authorization.
 */

const { supabase } = require("../services/supabaseService");

async function findAuthorization(organizationId, userId) {
  if (!organizationId || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("atlas_user_securities_authorization")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return null;
    }
    throw error;
  }

  return data || null;
}

async function listAuthorizationsForUsers(organizationId, userIds = []) {
  if (!organizationId || !userIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("atlas_user_securities_authorization")
    .select("*")
    .eq("organization_id", organizationId)
    .in("user_id", userIds)
    .is("deleted_at", null);

  if (error) {
    if (error.code === "42P01") {
      return [];
    }
    throw error;
  }

  return data || [];
}

async function upsertAuthorization(row) {
  const { data, error } = await supabase
    .from("atlas_user_securities_authorization")
    .upsert(row, { onConflict: "organization_id,user_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function softDeleteAuthorization(organizationId, userId, deletedAt = new Date().toISOString()) {
  const { data, error } = await supabase
    .from("atlas_user_securities_authorization")
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function appendHistory(entry) {
  const { data, error } = await supabase
    .from("atlas_user_securities_authorization_history")
    .insert(entry)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  findAuthorization,
  listAuthorizationsForUsers,
  upsertAuthorization,
  softDeleteAuthorization,
  appendHistory
};
