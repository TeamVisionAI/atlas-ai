/**
 * Conversation log tenant scope.
 * Phone is never sufficient tenant identity. Null-org history may attach only
 * when the phone is unique to the requesting organization. Collision → fail closed.
 */

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function collectPhoneAliases(phone) {
  const raw = String(phone || "").trim();
  if (!raw) {
    return [];
  }
  const aliases = new Set([raw]);
  const digits = normalizePhoneDigits(raw);
  if (digits) {
    aliases.add(digits);
    aliases.add(`+${digits}`);
  }
  return [...aliases];
}

function buildPhoneOrgIndex(prospectRows = []) {
  const orgsByAlias = new Map();
  for (const row of prospectRows || []) {
    const orgId = row.organization_id || row.organizationId || null;
    if (!orgId) {
      continue;
    }
    for (const alias of collectPhoneAliases(row.phone || row.normalized_phone)) {
      const orgs = orgsByAlias.get(alias) || new Set();
      orgs.add(String(orgId));
      orgsByAlias.set(alias, orgs);
    }
  }
  return orgsByAlias;
}

function isPhoneTenantCollision(phone, organizationId, orgsByAlias) {
  if (!phone || !organizationId || !orgsByAlias) {
    return false;
  }
  const foreign = new Set();
  for (const alias of collectPhoneAliases(phone)) {
    for (const orgId of orgsByAlias.get(alias) || []) {
      if (String(orgId) !== String(organizationId)) {
        foreign.add(orgId);
      }
    }
  }
  return foreign.size > 0;
}

function logBelongsToTenant(row, organizationId, { colliding = false } = {}) {
  if (!row || !organizationId) {
    return false;
  }
  const rowOrg = row.organization_id || row.organizationId || null;
  if (rowOrg) {
    return String(rowOrg) === String(organizationId);
  }
  return colliding !== true;
}

function filterConversationLogsForTenant(rows, organizationId, orgsByAlias) {
  return (rows || []).filter((row) => {
    const colliding = isPhoneTenantCollision(
      row.prospect_phone || row.prospectPhone,
      organizationId,
      orgsByAlias
    );
    return logBelongsToTenant(row, organizationId, { colliding });
  });
}

async function loadProspectPhoneOrgIndex(phones, deps = {}) {
  const unique = [...new Set((phones || []).flatMap((phone) => collectPhoneAliases(phone)))];
  if (!unique.length) {
    return new Map();
  }
  if (typeof deps.loadProspectPhoneOrgs === "function") {
    return buildPhoneOrgIndex(await deps.loadProspectPhoneOrgs(unique));
  }

  const { supabase } = require("../services/supabaseService");
  const select = "phone, normalized_phone, organization_id";
  const [byPhone, byNormalized] = await Promise.all([
    supabase.from("prospects").select(select).in("phone", unique),
    supabase.from("prospects").select(select).in("normalized_phone", unique)
  ]);
  if (byPhone.error) {
    throw byPhone.error;
  }
  if (byNormalized.error) {
    throw byNormalized.error;
  }
  return buildPhoneOrgIndex([...(byPhone.data || []), ...(byNormalized.data || [])]);
}

module.exports = {
  collectPhoneAliases,
  buildPhoneOrgIndex,
  isPhoneTenantCollision,
  logBelongsToTenant,
  filterConversationLogsForTenant,
  loadProspectPhoneOrgIndex
};
