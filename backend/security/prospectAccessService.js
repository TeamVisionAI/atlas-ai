/**
 * LC1 — Load prospects for authorization checks.
 * Sprint 19 — Organization-scoped phone lookups.
 */

const { supabase } = require("../services/supabaseService");
const { TABLE_NAME } = require("../modules/prospects/domain/constants");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

async function loadLegacyProspectByPhone(phone, organizationId = null) {
  let query = supabase.from("prospects").select("*").eq("phone", phone);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadCoreProspectById(prospectId, organizationId = null) {
  let query = supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("id", prospectId)
    .is("deleted_at", null);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function resolveProspectOrganizationId(prospect) {
  return prospect?.organization_id || prospect?.organizationId || DEFAULT_ORGANIZATION_ID;
}

module.exports = {
  loadLegacyProspectByPhone,
  loadCoreProspectById,
  resolveProspectOrganizationId
};
