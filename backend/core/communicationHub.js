/**
 * Sprint 11.4 Phase A — Communication Hub (transport layer).
 * Routes normalized channel messages to Conversation Engine and outbound adapters.
 * Conversation Engine remains channel-agnostic; this module handles delivery only.
 */

const { handleIncomingMessage } = require("./conversationEngine");
const { sendAndPersistWhatsAppMessage } = require("./whatsappOutboundPipeline");
const { buildNormalizedMessageFromWhatsApp } = require("./channelMessage");
const { loadPersistedWorkflowState } = require("./workflowStateStore");
const { loadAgentState } = require("./agentActionState");
const { isWorkflowGateActive } = require("./agentActionEngine");
const { OWNERSHIP } = require("./workflowConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

function extractReplyText(engineResult) {
  if (!engineResult) {
    return "";
  }

  if (typeof engineResult === "string") {
    return engineResult.trim();
  }

  return String(engineResult.reply || "").trim();
}

/**
 * Business-rules gate before automated outbound delivery (BR-034 human ownership, workflow gate).
 * @param {Object} prospect
 * @returns {boolean}
 */
function shouldDeliverAutomatedReply(prospect) {
  if (!prospect) {
    return false;
  }

  const step = String(prospect.current_step || "").toUpperCase();

  if (step.includes("DO NOT CONTACT") || step === "CLOSED") {
    return false;
  }

  const persisted = loadPersistedWorkflowState(prospect.phone);
  const agentState = loadAgentState(prospect.phone);

  if (isWorkflowGateActive(prospect, agentState)) {
    return false;
  }

  if (
    persisted.needsHumanAttention &&
    persisted.workflowOwnership === OWNERSHIP.AGENT
  ) {
    return false;
  }

  return true;
}

/**
 * Conversation Engine (understanding) → optional outbound delivery (transport).
 * @param {import('./channelMessage').NormalizedChannelMessage} normalized
 * @param {Object} context
 * @param {Object} context.prospect
 * @param {string} [context.contactName]
 */
async function processNormalizedInboundMessage(normalized, { prospect, contactName } = {}) {
  if (!normalized?.phone || !normalized?.text) {
    return {
      success: false,
      replied: false,
      reason: "INVALID_NORMALIZED_MESSAGE"
    };
  }

  const name = contactName || normalized.contactName || prospect?.name || "Unknown";

  logWhatsAppStage("conversation_engine_invoked", {
    phone: normalized.phone,
    channel: normalized.channel,
    providerMessageId: normalized.providerMessageId
  });

  const engineResult = await handleIncomingMessage(
    normalized.phone,
    name,
    normalized.text,
    {
      channel: normalized.channel,
      skipConversationLogging: normalized.channel === "whatsapp"
    }
  );

  const replyText = extractReplyText(engineResult);

  if (!replyText) {
    logWhatsAppStage("conversation_engine_no_reply", {
      phone: normalized.phone
    });

    return {
      success: true,
      replied: false,
      reason: "EMPTY_REPLY"
    };
  }

  if (normalized.channel !== "whatsapp") {
    logWhatsAppStage("conversation_engine_reply_local", {
      phone: normalized.phone,
      channel: normalized.channel
    });

    return {
      success: true,
      replied: Boolean(replyText),
      replyText,
      reason: "NON_WHATSAPP_CHANNEL",
      engineResult
    };
  }

  if (!shouldDeliverAutomatedReply(prospect)) {
    logWhatsAppStage("conversation_engine_reply_suppressed", {
      phone: normalized.phone,
      reason: "BUSINESS_RULES_OR_HUMAN_OWNERSHIP"
    });

    return {
      success: true,
      replied: false,
      reason: "REPLY_SUPPRESSED",
      replyText,
      engineResult
    };
  }

  if (normalized.channel === "whatsapp") {
    const delivery = await sendAndPersistWhatsAppMessage({
      to: normalized.phone,
      message: replyText,
      actor: "ATLAS",
      intent: "CONVERSATION_ENGINE_REPLY"
    });

    logWhatsAppStage("conversation_engine_reply_sent", {
      phone: normalized.phone,
      success: delivery.success,
      simulated: delivery.simulated || false
    });

    return {
      success: delivery.success,
      replied: delivery.success,
      replyText,
      engineResult,
      delivery
    };
  }

  return {
    success: true,
    replied: false,
    reason: "CHANNEL_DELIVERY_NOT_CONFIGURED",
    replyText,
    engineResult
  };
}

/**
 * Production entry: WhatsApp inbound already persisted by whatsappInboundPipeline.
 */
async function processConversationAfterInbound({
  inbound,
  storagePhone,
  prospect,
  contactName
}) {
  const normalized = buildNormalizedMessageFromWhatsApp(inbound, storagePhone);

  return processNormalizedInboundMessage(normalized, {
    prospect,
    contactName: contactName || prospect?.name
  });
}

module.exports = {
  shouldDeliverAutomatedReply,
  processNormalizedInboundMessage,
  processConversationAfterInbound,
  extractReplyText
};
