const {
  findProspect
} = require("../services/supabaseService");

const { handleSemanticMessage } = require("./semanticConversationEngine");
const { extractEmailFromNotes } = require("./informationModel");

function extractEmail(notes) {
  return extractEmailFromNotes(notes);
}

function buildHandoff(prospect) {
  if (!prospect || prospect.current_step !== "CONFIRMED") {
    return null;
  }

  const email = extractEmail(prospect.notes);

  return {
    qualified: prospect.work_authorized === true,
    interviewType:
      prospect.interview_type === "In Person"
        ? "Office"
        : prospect.interview_type,
    interviewTime: prospect.interview_time,
    email,
    handoffReady: Boolean(
      prospect.work_authorized === true &&
      prospect.calendar_event_id &&
      (email || prospect.interview_type === "In Person")
    )
  };
}

function buildReplyResult(reply, handoff = null) {
  return {
    reply,
    handoff
  };
}

async function finalizeReply(phone, reply) {
  const prospect = await findProspect(phone);
  return buildReplyResult(reply, buildHandoff(prospect));
}

/**
 * Receives one incoming WhatsApp message and decides how Atlas responds.
 * Semantic engine: collects missing information instead of fixed step order.
 */
async function handleIncomingMessage(phone, name, message, options = {}) {
  const channel = options.channel || "whatsapp";

  const reply = await handleSemanticMessage({
    phone,
    name,
    message,
    channel
  });

  return finalizeReply(phone, reply);
}

module.exports = {
  handleIncomingMessage,
  buildHandoff,
  extractEmail
};
