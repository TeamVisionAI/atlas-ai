const { createClient } = require("@supabase/supabase-js");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { assertProductionPlatformConfig } = require("../core/platformProductionGuard");
const { formatPhoneForStorage } = require("../core/phoneNormalizer");

assertProductionPlatformConfig();

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

async function findProspect(phone) {
  return findProspectForSystemIngress(phone);
}

/** Legacy system-ingress lookup. Do not use for authenticated tenant routes. */
async function findProspectForSystemIngress(phone) {
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function findProspectByNormalizedPhoneInOrganization(normalizedPhone, organizationId) {
  if (!normalizedPhone || !organizationId) {
    return null;
  }

  const { data: byNormalized, error: normalizedError } = await supabase
    .from("prospects")
    .select("*")
    .eq("normalized_phone", normalizedPhone)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (normalizedError && normalizedError.code !== "42703") {
    throw normalizedError;
  }

  if (byNormalized) {
    return byNormalized;
  }

  const storagePhone = formatPhoneForStorage(normalizedPhone);
  const byPhone = await findProspectInOrganization(storagePhone, organizationId);

  if (byPhone) {
    return byPhone;
  }

  const { data: legacyDigits, error: legacyError } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (legacyError) {
    throw legacyError;
  }

  return legacyDigits;
}

async function findProspectInOrganization(phone, organizationId) {
  if (!phone || !organizationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", phone)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function loadProspectsForOrganization(organizationId) {
  if (!organizationId) {
    return [];
  }

  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) throw error;

  return data || [];
}

async function createProspect(phone, name, lastMessage) {
  const { data, error } = await supabase
    .from("prospects")
    .insert({
      phone,
      name,
      last_message: lastMessage
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function updateProspect(phone, updates) {
    const { data, error } = await supabase
      .from("prospects")
      .update(updates)
      .eq("phone", phone)
      .select()
      .single();
  
    if (error) throw error;
  
    return data;
  }

async function findLatestActiveProspectInOrganization(organizationId) {
  let query = supabase.from("prospects").select("*").neq("current_step", "CONFIRMED");

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data: prospects, error } = await query;

  if (error) throw error;

  if (!prospects?.length) {
    return null;
  }

  const productionProspects = prospects.filter((prospect) =>
    isProductionProspect(prospect.phone)
  );

  if (!productionProspects.length) {
    return null;
  }

  const { data: logs, error: logError } = await supabase
    .from("conversation_logs")
    .select("prospect_phone, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!logError && logs?.length) {
    const activeByPhone = new Map(
      productionProspects.map((prospect) => [prospect.phone, prospect])
    );

    for (const log of logs) {
      const match = activeByPhone.get(log.prospect_phone);
      if (match) {
        return match;
      }
    }
  }

  return productionProspects[productionProspects.length - 1];
}

async function findLatestActiveProspect() {
  return findLatestActiveProspectInOrganization(null);
}

async function deleteProspect(phone) {
  const { error: logError } = await supabase
    .from("conversation_logs")
    .delete()
    .eq("prospect_phone", phone);

  if (logError) throw logError;

  const { error } = await supabase
    .from("prospects")
    .delete()
    .eq("phone", phone);

  if (error) throw error;
}

module.exports = {
  supabase,
  findProspect,
  findProspectForSystemIngress,
  findProspectInOrganization,
  findProspectByNormalizedPhoneInOrganization,
  loadProspectsForOrganization,
  findLatestActiveProspect,
  findLatestActiveProspectInOrganization,
  createProspect,
  updateProspect,
  deleteProspect
};