/**
 * LC1 — Load prospects for authorization checks.
 */

const { supabase } = require("../services/supabaseService");
const { TABLE_NAME } = require("../modules/prospects/domain/constants");

async function loadLegacyProspectByPhone(phone) {
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadCoreProspectById(prospectId) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("id", prospectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  loadLegacyProspectByPhone,
  loadCoreProspectById
};
