/**
 * Sprint 11.4 Phase A — Communication Hub (transport layer).
 * Routes normalized channel messages to Conversation Engine and outbound adapters.
 * Conversation Engine remains channel-agnostic; this module handles delivery only.
 *
 * BR-114 — one-user live authoring canary may intercept before legacy CE so
 * Recruit AI v2 authors the customer-facing reply. Canonical outbound remains here.
 */

const conversationEngine = require("./conversationEngine");
const whatsappOutboundPipeline = require("./whatsappOutboundPipeline");
const { buildNormalizedMessageFromWhatsApp } = require("./channelMessage");
const workflowStateStore = require("./workflowStateStore");
const { loadAgentState } = require("./agentActionState");
const { isWorkflowGateActive } = require("./agentActionEngine");
const { OWNERSHIP } = require("./workflowConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const liveAuthoringBridge = require("./recruitAiV2/liveAuthoringBridge");

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
 * BR-124 — optional allowHandoffAck delivers genuine V2 escalate / schedule-recovery replies
 * even when workflowState already has AGENT human ownership (avoids customer silence).
 * @param {Object} prospect
 * @param {{ allowHandoffAck?: boolean }} [options]
 * @returns {boolean}
 */
function shouldDeliverAutomatedReply(prospect, options = {}) {
  if (!prospect) {
    return false;
  }

  const step = String(prospect.current_step || "").toUpperCase();

  if (step.includes("DO NOT CONTACT") || step === "CLOSED") {
    return false;
  }

  const persisted = workflowStateStore.loadPersistedWorkflowState(prospect.phone);
  const agentState = loadAgentState(prospect.phone);

  if (isWorkflowGateActive(prospect, agentState)) {
    return false;
  }

  if (
    persisted.needsHumanAttention &&
    persisted.workflowOwnership === OWNERSHIP.AGENT
  ) {
    // Implements BR-124 — still deliver one customer-facing handoff/recovery ack.
    if (options.allowHandoffAck === true) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * BR-124 — compute whether this V2 turn may bypass AGENT human-ownership silence.
 * Strict nextAction allowlist; never opens for Conversation Engine or arbitrary V2 actions.
 * @param {Object} [engineResult]
 * @returns {boolean}
 */
function computeAllowHandoffAck(engineResult) {
  const nextAction = String(engineResult?.nextAction || "");
  const isV2Authoring = engineResult?.source === "recruit_ai_v2_live_authoring";
  if (!isV2Authoring) {
    return false;
  }
  return (
    nextAction === "escalate_to_human" ||
    nextAction === "safe_failure_and_escalate" ||
    nextAction === "resume_scheduling_after_explicit_request" ||
    nextAction === "offer_alternatives_or_escalate"
  );
}

/**
 * Conversation Engine (understanding) → optional outbound delivery (transport).
 * @param {import('./channelMessage').NormalizedChannelMessage} normalized
 * @param {Object} context
 * @param {Object} context.prospect
 * @param {string} [context.contactName]
 */
async function deliverWhatsAppReply({
  normalized,
  prospect,
  replyText,
  engineResult,
  outboundIntent = "CONVERSATION_ENGINE_REPLY"
}) {
  const allowHandoffAck = computeAllowHandoffAck(engineResult);

  if (!shouldDeliverAutomatedReply(prospect, { allowHandoffAck })) {
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

  let templateKey = null;
  let templateVariables = {};

  // Implements BR-078 — outside-window confirmation uses interview_confirmation.
  // Inside the care window, freeform body remains authorized by BR-075.
  if (outboundIntent === "APPOINTMENT_CONFIRMATION") {
    const {
      buildInterviewConfirmationVariables
    } = require("./whatsappTemplateVariableBuilder");
    templateKey = "interview_confirmation";
    templateVariables = buildInterviewConfirmationVariables(
      engineResult?.confirmationAppointment || {},
      prospect
    );
  } else if (
    outboundIntent === "INTERVIEW_DETAILS" ||
    outboundIntent === "RESCHEDULE_CONFIRMATION"
  ) {
    const {
      buildInterviewDetailsVariables
    } = require("./whatsappTemplateVariableBuilder");
    templateKey = "interview_details";
    templateVariables = buildInterviewDetailsVariables(
      engineResult?.detailsAppointment || engineResult?.confirmationAppointment || {},
      prospect
    );
  }

  const delivery = await whatsappOutboundPipeline.sendAndPersistWhatsAppMessage({
      to: normalized.phone,
      message: replyText,
      actor: "ATLAS",
      intent: outboundIntent,
      organizationId: prospect?.organization_id || null,
      idempotencyKey: engineResult?.confirmationIdempotencyKey || null,
      templateKey,
      templateVariables
  });

  logWhatsAppStage("conversation_engine_reply_sent", {
    phone: normalized.phone,
    success: delivery.success,
    simulated: delivery.simulated || false,
    intent: outboundIntent,
    idempotent: Boolean(engineResult?.confirmationIdempotencyKey)
  });

  return {
    success: delivery.success,
    replied: delivery.success,
    replyText,
    engineResult,
    delivery
  };
}

async function processNormalizedInboundMessage(
  normalized,
  { prospect, contactName, env = process.env, authoringDependencies = null } = {}
) {
  if (!normalized?.phone || !normalized?.text) {
    return {
      success: false,
      replied: false,
      reason: "INVALID_NORMALIZED_MESSAGE"
    };
  }

  const name = contactName || normalized.contactName || prospect?.name || "Unknown";

  // Implements BR-114 — one-user live authoring canary before legacy CE.
  // Shadow/advisory never enter this path. Successful v2 reply skips CE entirely.
  if (normalized.channel === "whatsapp" && prospect) {
    const authoringAttempt = await liveAuthoringBridge.attemptLiveV2Authoring({
      normalized,
      prospect,
      env,
      dependencies: authoringDependencies || {},
      logStage: logWhatsAppStage
    });

    if (authoringAttempt.authored && authoringAttempt.replyText) {
      const engineResult = {
        reply: authoringAttempt.replyText,
        outboundIntent: "CONVERSATION_ENGINE_REPLY",
        source: "recruit_ai_v2_live_authoring",
        nextAction: authoringAttempt.nextAction,
        v2Result: authoringAttempt.v2Result
      };

      return deliverWhatsAppReply({
        normalized,
        prospect,
        replyText: authoringAttempt.replyText,
        engineResult,
        outboundIntent: "CONVERSATION_ENGINE_REPLY"
      });
    }
    // Technical failure / empty / ineligible → fall through to legacy CE once.
  }

  logWhatsAppStage("conversation_engine_invoked", {
    phone: normalized.phone,
    channel: normalized.channel,
    providerMessageId: normalized.providerMessageId
  });

  const engineResult = await conversationEngine.handleIncomingMessage(
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

  if (normalized.channel === "whatsapp") {
    const outboundIntent =
      engineResult?.outboundIntent ||
      (engineResult?.confirmationIdempotencyKey
        ? "APPOINTMENT_CONFIRMATION"
        : "CONVERSATION_ENGINE_REPLY");

    return deliverWhatsAppReply({
      normalized,
      prospect,
      replyText,
      engineResult,
      outboundIntent
    });
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
  computeAllowHandoffAck,
  processNormalizedInboundMessage,
  processConversationAfterInbound,
  extractReplyText
};
