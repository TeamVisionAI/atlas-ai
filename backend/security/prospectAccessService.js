/**
 * LC1 — Load prospects for authorization checks.
 * Sprint 19 — Organization-scoped phone lookups.
 */

const { supabase } = require("../services/supabaseService");
const { TABLE_NAME } = require("../modules/prospects/domain/constants");

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

async function loadLegacyProspectById(prospectId, organizationId = null) {
  let query = supabase.from("prospects").select("*").eq("id", prospectId);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Count legacy prospects that share a phone (exact or normalized) for ambiguity checks.
 * When organizationId is null, counts across all organizations.
 */
async function countLegacyProspectsSharingPhone({
  phone,
  normalizedPhone = null,
  organizationId = null
}) {
  const phones = [...new Set([phone, normalizedPhone].filter(Boolean).map(String))];

  if (!phones.length) {
    return 0;
  }

  let matched = 0;
  const seen = new Set();

  for (const candidate of phones) {
    let byPhone = supabase.from("prospects").select("id, organization_id, phone");
    if (organizationId) {
      byPhone = byPhone.eq("organization_id", organizationId);
    }
    const { data: phoneRows, error: phoneError } = await byPhone.eq("phone", candidate);
    if (phoneError) {
      throw phoneError;
    }
    for (const row of phoneRows || []) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        matched += 1;
      }
    }

    let byNormalized = supabase
      .from("prospects")
      .select("id, organization_id, phone");
    if (organizationId) {
      byNormalized = byNormalized.eq("organization_id", organizationId);
    }
    const { data: normalizedRows, error: normalizedError } = await byNormalized.eq(
      "normalized_phone",
      candidate.replace(/^\+/, "")
    );
    if (normalizedError) {
      // Column may be absent in older environments — ignore and continue.
      if (!/normalized_phone|does not exist|PGRST/i.test(String(normalizedError.message || ""))) {
        throw normalizedError;
      }
    } else {
      for (const row of normalizedRows || []) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          matched += 1;
        }
      }
    }
  }

  return matched;
}

async function loadCoreProspectById(prospectId, organizationId) {
  if (!prospectId || !organizationId) {
    return null;
  }

  let query = supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("id", prospectId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function resolveProspectOrganizationId(prospect) {
  return prospect?.organization_id || prospect?.organizationId || null;
}

module.exports = {
  loadLegacyProspectByPhone,
  loadLegacyProspectById,
  countLegacyProspectsSharingPhone,
  loadCoreProspectById,
  resolveProspectOrganizationId
};
