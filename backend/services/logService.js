const { supabase } = require("./supabaseService");
const { emitConversationLogEvent } = require("../core/conversationEventBridge");

async function logConversation(data) {
  const { data: rows, error } = await supabase
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
    ])
    .select()
    .single();

  if (error) {
    console.error("LOG ERROR:", error);
    return { success: false, error };
  }

  try {
    await emitConversationLogEvent(rows, {
      correlationId: data.eventCorrelationId,
      providerMessageId: data.providerMessageId,
      rawWebhookPayload: data.rawWebhookPayload,
      actorOverride: data.actorOverride
    });
  } catch (emitError) {
    console.error("[logService] conversation event emit failed:", emitError.message);
  }

  return { success: true, log: rows };
}

module.exports = {
  logConversation
};
