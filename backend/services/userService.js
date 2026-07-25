/**
 * Sprint 16.9 — Canonical users table service.
 * Falls back to atlas_users when users table is unavailable.
 */

const { supabase } = require("./supabaseService");
const { isPgFallbackEnabled, pgQueryOne } = require("./pgFallback");

async function findUserById(userId) {
  if (!userId) {
    return null;
  }

  if (isPgFallbackEnabled()) {
    const row = await pgQueryOne("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);

    if (row) {
      return row;
    }

    return pgQueryOne("SELECT * FROM atlas_users WHERE id = $1 LIMIT 1", [userId]);
  }

  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();

  if (error && error.code === "42P01") {
    const { data: legacy } = await supabase
      .from("atlas_users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    return legacy;
  }

  if (error) {
    throw error;
  }

  return data;
}

async function findUserByEmail(email) {
  if (!email) {
    return null;
  }

  const normalized = String(email).trim().toLowerCase();

  if (isPgFallbackEnabled()) {
    const row = await pgQueryOne("SELECT * FROM users WHERE lower(email) = $1 LIMIT 1", [
      normalized
    ]);

    if (row) {
      return row;
    }

    return pgQueryOne("SELECT * FROM atlas_users WHERE lower(email) = $1 LIMIT 1", [normalized]);
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();

  if (error && error.code === "42P01") {
    const { data: legacy } = await supabase
      .from("atlas_users")
      .select("*")
      .eq("email", normalized)
      .maybeSingle();

    return legacy;
  }

  if (error) {
    throw error;
  }

  return data;
}

async function updateUserLastLogin(userId) {
  const timestamp = new Date().toISOString();

  const { error } = await supabase
    .from("users")
    .update({ last_login: timestamp, updated_at: timestamp })
    .eq("id", userId);

  if (error && error.code !== "42P01") {
    throw error;
  }
}

module.exports = {
  findUserById,
  findUserByEmail,
  updateUserLastLogin
};
