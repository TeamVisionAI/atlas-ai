const {
  findProspect
} = require("../services/supabaseService");

const { handleSemanticMessage } = require("./semanticConversationEngine");
const { extractEmailFromNotes } = require("./informationModel");
const { buildRecruiterHandoff } = require("./appointmentHandoffReadModel");

function extractEmail(notes) {
  return extractEmailFromNotes(notes);
}

/**
 * Pure handoff builder when appointment context is already resolved.
 * Implements BR-050 — lifecycle from persisted appointments, not prospect.current_step.
 */
function buildHandoff(prospect, appointmentContext = null) {
  if (!prospect) {
    return null;
  }

  if (appointmentContext && typeof appointmentContext === "object") {
    return buildRecruiterHandoff(prospect, appointmentContext);
  }

  return buildRecruiterHandoff(prospect, {});
}

async function buildHandoffForProspect(prospect) {
  if (!prospect) {
    return null;
  }

  const { resolveRecruiterHandoffForProspect } = require("../services/appointmentListService");
  return resolveRecruiterHandoffForProspect(prospect);
}

function buildReplyResult(reply, handoff = null) {
  return {
    reply,
    handoff
  };
}

async function finalizeReply(phone, reply) {
  const prospect = await findProspect(phone);
  if (!prospect) {
    return buildReplyResult(reply, null);
  }

  const { resolveRecruiterHandoffForProspect } = require("../services/appointmentListService");
  const handoff = await resolveRecruiterHandoffForProspect(prospect);
  return buildReplyResult(reply, handoff);
}

/**
 * Receives one incoming WhatsApp message and decides how Atlas responds.
 * Semantic engine: collects missing information instead of fixed step order.
 */
async function handleIncomingMessage(phone, name, message, options = {}) {
  const reply = await handleSemanticMessage({
    phone,
    name,
    message,
    channel: options.channel || "whatsapp",
    skipConversationLogging: Boolean(options.skipConversationLogging),
    messageType: options.messageType || null
  });

  return finalizeReply(phone, reply);
}

module.exports = {
  handleIncomingMessage,
  buildHandoff,
  buildHandoffForProspect,
  buildRecruiterHandoff,
  extractEmail
};
