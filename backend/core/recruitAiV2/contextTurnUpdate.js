/**
 * Recruit AI v2 — shared context advancement for a single inbound turn.
 * Used by continuous capture (lightweight) and shadow evaluation (full).
 * Implements BR-081 Phase 3B: exactly-once durable context per inbound_message_id.
 */

const { interpretInboundMessage } = require("./interpreter");
const { decideConversationTurn, decideSafeFailure } = require("./decisionEngine");
const { mergeConversationContext } = require("./conversationContext");
const { loadConversationContext } = require("./contextLoader");

/**
 * Apply interpretation + decision patches to context without rendering copy.
 */
function buildNextContextFromInterpretation({
  loaded,
  interpretation,
  structuredDecision
}) {
  let nextContext = mergeConversationContext(
    loaded,
    structuredDecision.contextPatch || {}
  );

  nextContext.conversation = {
    ...nextContext.conversation,
    lastProspectIntent: interpretation.intent,
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

  if (interpretation.preferredLanguage && interpretation.preferredLanguage !== "unknown") {
    nextContext.preferredLanguage = interpretation.preferredLanguage;
  }

  if (
    interpretation.intent === "provide_location" &&
    (interpretation.entities?.city || interpretation.entities?.state)
  ) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      city: interpretation.entities.city || nextContext.knownFacts?.city || null,
      state: interpretation.entities.state || nextContext.knownFacts?.state || null
    };
  }

  if (interpretation.intent === "provide_name" && interpretation.entities?.name) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      name: interpretation.entities.name
    };
  }

  return nextContext;
}

/**
 * Lightweight interpret → decide → nextContext (no render, no side effects).
 */
function computeContextOnlyTurn({
  message,
  context = null,
  contextInput = null,
  availability = null,
  options = {}
} = {}) {
  const loaded = context || loadConversationContext(contextInput || {});
  const interpretation = interpretInboundMessage({
    message,
    context: loaded,
    options
  });

  const structuredDecision = options.forceSafeFailure
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

  const nextContext = buildNextContextFromInterpretation({
    loaded,
    interpretation,
    structuredDecision
  });

  return {
    context: loaded,
    nextContext,
    interpretation,
    structuredDecision,
    decisionCode: structuredDecision.decision?.nextAction || null
  };
}

module.exports = {
  buildNextContextFromInterpretation,
  computeContextOnlyTurn
};
