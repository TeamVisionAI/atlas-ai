/**
 * Recruit AI v2 — shared context advancement for a single inbound turn.
 * Used by continuous capture (lightweight) and shadow evaluation (full).
 * Implements BR-081 Phase 3B / BR-082: exactly-once durable context per inbound_message_id.
 */

const { interpretInboundMessage } = require("./interpreter");
const { decideConversationTurn, decideSafeFailure } = require("./decisionEngine");
const { mergeConversationContext } = require("./conversationContext");
const { loadConversationContext } = require("./contextLoader");
const { FACT_CERTAINTY } = require("./locationFacts");

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
  if (interpretation.languageMeta) {
    nextContext.languageMeta = {
      ...(nextContext.languageMeta || {}),
      ...interpretation.languageMeta
    };
  }

  if (
    interpretation.intent === "provide_location" ||
    interpretation.intent === "correct_location"
  ) {
    const completeness = interpretation.entities?.completeness;
    const city =
      interpretation.entities?.city || nextContext.knownFacts?.city || null;
    const state = interpretation.entities?.state || null;
    const proposedState =
      interpretation.entities?.proposedState ||
      (completeness === "partial"
        ? interpretation.entities?.proposedState
        : null);

    if (completeness === "complete" && city && state) {
      // Correction overwrites prior city; no competing active city fact.
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        city,
        state,
        cityCertainty: FACT_CERTAINTY.CONFIRMED,
        stateCertainty: FACT_CERTAINTY.CONFIRMED,
        proposedState: null
      };
    } else if (city) {
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        city,
        state: null,
        cityCertainty: FACT_CERTAINTY.PARTIAL,
        stateCertainty: proposedState
          ? FACT_CERTAINTY.PROPOSED
          : FACT_CERTAINTY.UNKNOWN,
        proposedState: proposedState || null
      };
    }
  }

  if (
    interpretation.intent === "provide_authorization" &&
    interpretation.entities?.workAuthorization != null
  ) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      workAuthorization: Boolean(interpretation.entities.workAuthorization)
    };
  }

  if (interpretation.intent === "provide_name" && interpretation.entities?.name) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      name: interpretation.entities.name
    };
  }

  if (
    interpretation.intent === "request_language_switch" &&
    interpretation.entities?.requestedLanguage
  ) {
    nextContext.preferredLanguage = interpretation.entities.requestedLanguage;
    nextContext.languageMeta = {
      ...(nextContext.languageMeta || {}),
      source: "explicit",
      lastMessageLanguage: interpretation.entities.requestedLanguage
    };
  }

  if (
    interpretation.intent === "provide_meeting_preference" &&
    interpretation.entities?.appointmentType
  ) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      preferredMeetingType: interpretation.entities.appointmentType
    };
    nextContext.appointment = {
      ...nextContext.appointment,
      meetingType: interpretation.entities.appointmentType
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

/**
 * Sanitized capture-only diagnostic (no raw PII / message body / secrets).
 */
function buildCaptureDiagnostic({
  inboundMessageId = null,
  interpretation = null,
  decisionCode = null,
  nextContext = null,
  elapsedMs = null,
  requiresClarification = null
} = {}) {
  const id = inboundMessageId ? String(inboundMessageId) : null;
  return {
    inboundMessageIdTail: id && id.length > 12 ? id.slice(-12) : id,
    intent: interpretation?.intent || null,
    confidence:
      interpretation?.confidence != null
        ? Number(interpretation.confidence)
        : null,
    messageLanguage: interpretation?.messageLanguage || null,
    preferredLanguage: interpretation?.preferredLanguage || null,
    languageAdapted: Boolean(interpretation?.languageAdapted),
    stage: nextContext?.currentStage || null,
    clarification: Boolean(
      requiresClarification ?? interpretation?.requiresClarification
    ),
    decisionCode: decisionCode || null,
    reasonCodes: Array.isArray(
      interpretation?.reasonCodes || interpretation?.structuredReasonCodes
    )
      ? interpretation.reasonCodes
      : null,
    cityCertainty: nextContext?.knownFacts?.cityCertainty || null,
    stateCertainty: nextContext?.knownFacts?.stateCertainty || null,
    elapsedMs: elapsedMs != null ? Number(elapsedMs) : null
  };
}

module.exports = {
  buildNextContextFromInterpretation,
  computeContextOnlyTurn,
  buildCaptureDiagnostic
};
