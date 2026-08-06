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
 * Run one Recruit AI v2 decision cycle. Never sends WhatsApp or books appointments.
 */
function processRecruitAiV2Turn({
  message,
  contextInput = null,
  context = null,
  availability = null,
  options = {}
} = {}) {
  const loaded =
    context ||
    loadConversationContext(contextInput || {});

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
      sideEffectsAuthorized: false
    }
  };
}

module.exports = {
  processRecruitAiV2Turn
};
