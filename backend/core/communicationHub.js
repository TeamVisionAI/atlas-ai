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
 * @returns {Promise<boolean>}
 */
async function shouldDeliverAutomatedReply(prospect, options = {}) {
  if (!prospect) {
    return false;
  }

  const step = String(prospect.current_step || "").toUpperCase();

  if (step.includes("DO NOT CONTACT") || step === "CLOSED") {
    return false;
  }

  let persisted;
  try {
    persisted = await workflowStateStore.loadPersistedWorkflowState(
      prospect.phone,
      {
        organizationId: prospect.organization_id || null,
        prospectId: prospect.id || null
      }
    );
  } catch (error) {
    // BR-135 — fail closed: never auto-reply when durable ownership cannot be read.
    logWhatsAppStage("automated_reply_suppressed_workflow_state_unavailable", {
      phone: prospect.phone || null,
      code: error?.code || null,
      message: error?.message || null
    });
    return false;
  }
  const agentState = loadAgentState(prospect.phone);

  if (isWorkflowGateActive(prospect, agentState)) {
    return false;
  }

  // Sticky TAKE OVER / manual human hold — Atlas is absolutely silent until Return to Atlas.
  // Closes allowHandoffAck hole: no V2/CE/escalation/recovery ack while manual hold is active.
  if (
    persisted.manualAgentOwnership === true ||
    Boolean(persisted.humanTakenOverAt)
  ) {
    return false;
  }

  // Hard ownership guard — AGENT ownership or NEEDS_ATTENTION must not double-speak.
  // Fail closed: suppress automated conversational replies unless BR-124 allowHandoffAck
  // (only when there is no sticky/manual TAKE OVER hold above).
  const humanOwned = persisted.workflowOwnership === OWNERSHIP.AGENT;
  const needsAttention = Boolean(persisted.needsHumanAttention);

  if (humanOwned || needsAttention) {
    if (options.allowHandoffAck === true) {
      // Implements BR-124 — customer-facing handoff/recovery ack may still deliver
      // for stall/escalate without an active TAKE OVER seal.
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

  if (!(await shouldDeliverAutomatedReply(prospect, { allowHandoffAck }))) {
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

  const isV2Owned =
    engineResult?.source === "recruit_ai_v2_live_authoring" ||
    engineResult?.owner === "v2";
  const v2Result = engineResult?.v2Result || null;
  const replyType =
    v2Result?.responsePlan?.templateKey ||
    engineResult?.templateKey ||
    engineResult?.nextAction ||
    null;
  const appointmentId =
    v2Result?.execution?.appointmentId ||
    v2Result?.nextContext?.appointment?.appointmentId ||
    engineResult?.appointmentId ||
    null;
  const prospectId =
    v2Result?.nextContext?.prospectId ||
    v2Result?.context?.prospectId ||
    engineResult?.prospectId ||
    null;
  let calendarEventId = null;
  try {
    const {
      resolveCalendarEventId
    } = require("./recruitAiV2/stage1Observability");
    calendarEventId = resolveCalendarEventId(v2Result?.execution?.scheduleResult);
  } catch {
    calendarEventId = null;
  }

  logWhatsAppStage("conversation_engine_reply_sent", {
    phone: normalized.phone,
    success: delivery.success,
    simulated: delivery.simulated || false,
    intent: outboundIntent,
    idempotent: Boolean(engineResult?.confirmationIdempotencyKey),
    // Stage-1 attribution — owner unambiguous even if outboundIntent stays CE.
    owner: isV2Owned ? "v2" : "ce",
    decisionCode: engineResult?.nextAction || null,
    replyType,
    appointmentId,
    prospectId
  });

  try {
    const {
      EVENTS,
      emitRecruitAiV2Signal
    } = require("./recruitAiV2/stage1Observability");
    emitRecruitAiV2Signal(EVENTS.REPLY_DELIVERED, {
      organizationId: prospect?.organization_id || null,
      agentId: prospect?.owner_user_id || null,
      prospectId,
      phone: normalized.phone,
      decisionCode: engineResult?.nextAction || null,
      appointmentId,
      calendarEventId,
      correlationId: normalized.providerMessageId || null,
      owner: isV2Owned ? "v2" : "ce",
      replyType,
      templateKey: replyType,
      outboundIntent,
      deliverySuccess: Boolean(delivery.success),
      outcome: delivery.success ? "delivered" : "delivery_failed",
      source: engineResult?.source || null
    });
  } catch {
    // Telemetry must never affect delivery.
  }

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
        owner: "v2",
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

    // Implements BR-125 / BR-126 — never hand create/confirmable-proposed ownership to CE
    // after authoring loss (timeout, empty reply, or cancelled create rollback).
    if (
      authoringAttempt?.fallThrough &&
      (authoringAttempt.nextAction === "create_appointment" ||
        authoringAttempt.reason === "LIVE_AUTHORING_TIMEOUT" ||
        authoringAttempt.reason === "EMPTY_OR_UNSAFE_REPLY" ||
        authoringAttempt.reason === "LIVE_AUTHORING_TECHNICAL_FAILURE")
    ) {
      try {
        const {
          reclaimOrProtectConfirmableProposal,
          createDefaultPersistenceService
        } = require("./recruitAiV2/liveAuthoringBridge");
        const protectedReply = await reclaimOrProtectConfirmableProposal({
          v2Result: authoringAttempt.v2Result,
          prospect,
          normalized,
          organizationId: prospect.organization_id || prospect.organizationId || null,
          actingUserId: authoringAttempt.actingUserId,
          allowExecution: authoringAttempt.allowExecution,
          persistence:
            authoringDependencies?.persistenceService ||
            createDefaultPersistenceService(),
          findActiveAppointment: authoringDependencies?.findActiveAppointmentForProspect,
          logStage: logWhatsAppStage
        });
        if (protectedReply?.authored && protectedReply.replyText) {
          return deliverWhatsAppReply({
            normalized,
            prospect,
            replyText: protectedReply.replyText,
            engineResult: {
              reply: protectedReply.replyText,
              outboundIntent: "CONVERSATION_ENGINE_REPLY",
              source: "recruit_ai_v2_live_authoring",
              owner: "v2",
              nextAction: protectedReply.nextAction,
              v2Result: protectedReply.v2Result
            },
            outboundIntent: "CONVERSATION_ENGINE_REPLY"
          });
        }
      } catch {
        // Fall through to legacy CE once.
      }
    }
    // Technical failure / empty / ineligible → fall through to legacy CE once.
  }

  // BR-118 / BR-140 — non-text media must not enter legacy CE as semantic text.
  // V2 eligible path already authored above. Pre-STT: freeze qualification, no clarify_once.
  const { classifyInboundMedia } = require("./recruitAiV2/nonTextMedia");
  const mediaClass = classifyInboundMedia(normalized);
  if (mediaClass.isNonTextMedia) {
    logWhatsAppStage("legacy_ce_non_text_media_skipped", {
      phone: normalized.phone,
      messageType: mediaClass.mediaType,
      detection: mediaClass.detection,
      providerMessageId: normalized.providerMessageId || null
    });
    return {
      success: true,
      replied: false,
      reason: "NON_TEXT_MEDIA_NO_STT",
      mediaType: mediaClass.mediaType
    };
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
      skipConversationLogging: normalized.channel === "whatsapp",
      messageType: normalized.messageType || null
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
  deliverWhatsAppReply,
  processNormalizedInboundMessage,
  processConversationAfterInbound,
  extractReplyText
};
