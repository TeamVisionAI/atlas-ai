const { createClient } = require("@supabase/supabase-js");
const { isProductionProspect } = require("../core/productionProspectFilter");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function findProspect(phone) {
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (error) throw error;

  return data;
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

async function findLatestActiveProspect() {
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("*")
    .neq("current_step", "CONFIRMED");

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
    findLatestActiveProspect,
    createProspect,
    updateProspect,
    deleteProspect
  };