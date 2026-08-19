let conversationLogQueryClientOverride = null;

function getConversationLogQueryClient() {
  if (conversationLogQueryClientOverride) {
    return conversationLogQueryClientOverride;
  }

  return require("./supabaseService").supabase;
}

function setConversationLogQueryClientForTests(client) {
  conversationLogQueryClientOverride = client;
}

function resetConversationLogQueryClientForTests() {
  conversationLogQueryClientOverride = null;
}

class TimelineOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required for timeline lookup") {
    super(message);
    this.name = "TimelineOrganizationRequiredError";
    this.statusCode = 400;
    this.publicCode = "ORGANIZATION_REQUIRED";
  }
}

/**
 * Tenant-scoped conversation log timeline. Never query by phone alone.
 */
async function getConversationTimeline(phone, organizationId) {
  if (!phone) {
    const error = new Error("phone is required for timeline lookup");
    error.statusCode = 400;
    error.publicCode = "PHONE_REQUIRED";
    throw error;
  }

  if (!organizationId) {
    throw new TimelineOrganizationRequiredError();
  }

  const { data, error } = await getConversationLogQueryClient()
    .from("conversation_logs")
    .select("*")
    .eq("prospect_phone", phone)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data || [];
}

module.exports = {
  getConversationTimeline,
  TimelineOrganizationRequiredError,
  setConversationLogQueryClientForTests,
  resetConversationLogQueryClientForTests
};