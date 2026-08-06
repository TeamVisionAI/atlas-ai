/**
 * Recruit AI v2 — turn orchestrator.
 *
 * incoming message
 *   → canonical conversation context
 *   → structured interpretation
 *   → business decision
 *   → response plan
 *   → rendered copy
 *   → side-effect proposal
 *   → policy/authorization gate
 *   → optional execution (DISABLED this sprint)
 *   → durable context persistence (Phase 2; context write only)
 *
 * Implements BR-081 / BR-049: decide and plan; do not reimplement booking engines.
 */

const { loadConversationContext } = require("./contextLoader");
const { interpretInboundMessage } = require("./interpreter");
const { decideConversationTurn, decideSafeFailure } = require("./decisionEngine");
const { buildResponsePlan } = require("./responsePlan");
const { renderCustomerReply } = require("./responseRenderer");
const { authorizeSideEffects } = require("./sideEffectAuthorizer");
const { mergeConversationContext } = require("./conversationContext");
const { containsInternalDiagnostics } = require("./sanitize");

/**
 * Run one Recruit AI v2 decision cycle.
 * Never sends WhatsApp or books appointments.
 * May persist sanitized context when a persistenceService is provided.
 */
async function processRecruitAiV2Turn({
  message,
  contextInput = null,
  context = null,
  availability = null,
  options = {},
  persistenceService = null
} = {}) {
  const organizationId =
    context?.organizationId ||
    contextInput?.organizationId ||
    null;
  const prospectId =
    context?.prospectId ||
    contextInput?.prospectId ||
    null;
  const channel = options.channel || "whatsapp";
  const inboundMessageId =
    message?.id ||
    message?.providerMessageId ||
    options.inboundMessageId ||
    null;

  let loaded = context || null;
  let persistenceSource = context?._persistence ? "persisted" : "provided";

  if (!loaded && persistenceService && organizationId && prospectId) {
    const loadedOrRebuilt = await persistenceService.loadOrReconstruct({
      organizationId,
      prospectId,
      channel,
      reconstructionInput: contextInput || {}
    });
    loaded = loadedOrRebuilt.context;
    persistenceSource = loadedOrRebuilt.source;
  }

  if (!loaded) {
    loaded = loadConversationContext(contextInput || {});
    persistenceSource = loaded.persistenceSource || "ephemeral";
  }

  const interpretation = interpretInboundMessage({
    message,
    context: loaded,
    options
  });

  let structuredDecision;

  if (options.forceSafeFailure) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: options.failureReason || "forced_safe_failure"
    });
  } else {
    structuredDecision = decideConversationTurn({
      context: loaded,
      interpretation,
      availability
    });
  }

  let responsePlan = buildResponsePlan(structuredDecision);
  let rendered = renderCustomerReply(responsePlan);

  if (containsInternalDiagnostics(rendered.text)) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: "renderer_diagnostic_blocked"
    });
    responsePlan = buildResponsePlan(structuredDecision);
    rendered = renderCustomerReply(responsePlan);
  }

  const authorization = authorizeSideEffects({
    structuredDecision,
    responsePlan,
    env: options.env || process.env
  });

  let nextContext = mergeConversationContext(loaded, structuredDecision.contextPatch || {});
  nextContext.conversation = {
    ...nextContext.conversation,
    lastProspectIntent: interpretation.intent,
    lastOfferMade: responsePlan.templateKey || nextContext.conversation.lastOfferMade,
    lastCounterofferTime:
      interpretation.intent === "scheduling_counteroffer"
        ? interpretation.entities?.requestedTime ||
          nextContext.conversation.lastCounterofferTime
        : nextContext.conversation.lastCounterofferTime
  };

  if (
    (interpretation.intent === "scheduling_counteroffer" ||
      interpretation.intent === "reschedule_request") &&
    interpretation.entities?.requestedTime
  ) {
    nextContext.appointment = {
      ...nextContext.appointment,
      proposedTime: interpretation.entities.requestedTime,
      status:
        interpretation.intent === "reschedule_request" ||
        nextContext.appointment?.status === "confirmed"
          ? "reschedule_requested"
          : nextContext.appointment?.status || "proposed"
    };
  }

  let persistenceResult = null;

  if (
    persistenceService &&
    organizationId &&
    prospectId &&
    options.persistContext !== false
  ) {
    persistenceResult = await persistenceService.compareAndSaveContext({
      organizationId,
      prospectId,
      channel,
      expectedVersion: loaded._persistence?.contextVersion,
      nextContext,
      inboundMessageId,
      decisionCode: structuredDecision.decision?.nextAction || null,
      prospectClosed: Boolean(options.prospectClosed)
    });

    if (persistenceResult?.context) {
      nextContext = persistenceResult.context;
    }
  }

  return {
    context: loaded,
    nextContext,
    interpretation,
    structuredDecision,
    responsePlan,
    rendered,
    authorization,
    persistence: {
      attempted: Boolean(persistenceService && options.persistContext !== false),
      source: persistenceSource,
      result: persistenceResult
        ? {
            ok: persistenceResult.ok,
            idempotent: Boolean(persistenceResult.idempotent),
            code: persistenceResult.code || null,
            contextVersion: persistenceResult.context?._persistence?.contextVersion || null
          }
        : null
    },
    execution: {
      attempted: false,
      performed: [],
      skipped: authorization.proposals.map((p) => p.type)
    },
    audit: {
      at: new Date().toISOString(),
      intent: interpretation.intent,
      nextAction: structuredDecision.decision.nextAction,
      reasonCodes: structuredDecision.reasonCodes,
      mayCreateAppointment: false,
      sideEffectsAuthorized: false,
      contextPersisted: Boolean(persistenceResult?.ok)
    }
  };
}

/** Sync wrapper for callers that do not need persistence. */
function processRecruitAiV2TurnSync(args = {}) {
  if (args.persistenceService) {
    throw new Error("Use async processRecruitAiV2Turn when persistenceService is provided");
  }

  // Preserve prior sync behavior for fixture tests without persistence.
  const {
    message,
    contextInput = null,
    context = null,
    availability = null,
    options = {}
  } = args;

  const loaded = context || loadConversationContext(contextInput || {});
  const interpretation = interpretInboundMessage({
    message,
    context: loaded,
    options
  });

  let structuredDecision = options.forceSafeFailure
    ? decideSafeFailure({
        context: loaded,
        interpretation,
        failureReason: options.failureReason || "forced_safe_failure"
      })
    : decideConversationTurn({
        context: loaded,
        interpretation,
        availability
      });

  let responsePlan = buildResponsePlan(structuredDecision);
  let rendered = renderCustomerReply(responsePlan);

  if (containsInternalDiagnostics(rendered.text)) {
    structuredDecision = decideSafeFailure({
      context: loaded,
      interpretation,
      failureReason: "renderer_diagnostic_blocked"
    });
    responsePlan = buildResponsePlan(structuredDecision);
    rendered = renderCustomerReply(responsePlan);
  }

  const authorization = authorizeSideEffects({
    structuredDecision,
    responsePlan,
    env: options.env || process.env
  });

  const nextContext = mergeConversationContext(loaded, structuredDecision.contextPatch || {});
  nextContext.conversation = {
    ...nextContext.conversation,
    lastProspectIntent: interpretation.intent,
    lastOfferMade: responsePlan.templateKey || nextContext.conversation.lastOfferMade
  };

  return {
    context: loaded,
    nextContext,
    interpretation,
    structuredDecision,
    responsePlan,
    rendered,
    authorization,
    persistence: { attempted: false, source: "ephemeral", result: null },
    execution: {
      attempted: false,
      performed: [],
      skipped: authorization.proposals.map((p) => p.type)
    },
    audit: {
      at: new Date().toISOString(),
      intent: interpretation.intent,
      nextAction: structuredDecision.decision.nextAction,
      reasonCodes: structuredDecision.reasonCodes,
      mayCreateAppointment: false,
      sideEffectsAuthorized: false,
      contextPersisted: false
    }
  };
}

module.exports = {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync
};
