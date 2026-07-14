const { createClient } = require("@supabase/supabase-js");

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
  module.exports = {
    supabase,
    findProspect,
    createProspect,
    updateProspect
  };