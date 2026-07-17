const { supabase } = require("./supabaseService");

async function getConversationTimeline(phone) {
  const { data, error } = await supabase
    .from("conversation_logs")
    .select("*")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data;
}

module.exports = {
  getConversationTimeline
};