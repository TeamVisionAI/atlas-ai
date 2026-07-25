/**
 * LC1.1 — Login history persistence.
 */

const { supabase } = require("../services/supabaseService");

async function writeLoginHistory(entry = {}) {
  const payload = {
    user_id: entry.userId || null,
    user_email: entry.userEmail || null,
    event_type: entry.eventType,
    result: entry.result || "success",
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null,
    metadata: entry.metadata || {}
  };

  const { data, error } = await supabase
    .from("atlas_login_history")
    .insert(payload)
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[login-history]", error.message, payload.event_type);
    return null;
  }

  return data;
}

module.exports = {
  writeLoginHistory
};
