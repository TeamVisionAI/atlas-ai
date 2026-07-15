const { supabase } = require("./supabaseService");

async function logConversation(data) {
  const { error } = await supabase
    .from("conversation_logs")
    .insert([
      {
        prospect_phone: data.phone,
        prospect_name: data.name,
        direction: data.direction,
        message: data.message,
        intent: data.intent,
        pipeline: data.pipeline,
        current_step: data.currentStep,
        language: data.language,
        city: data.city,
        state: data.state
      }
    ]);

  if (error) {
    console.error("LOG ERROR:", error);
  }
}

module.exports = {
  logConversation
};