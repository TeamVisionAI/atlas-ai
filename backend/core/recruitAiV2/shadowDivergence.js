/**
 * Recruit AI v2 — live CE vs v2 divergence classification.
 * Sanitized comparison only; never stores customer-visible copy bodies.
 * Implements BR-081 Phase 3.
 */

const { containsInternalDiagnostics } = require("./sanitize");
const { normalizeLanguage } = require("./conversationContext");

const DIVERGENCE = Object.freeze({
  ALIGNED: "aligned",
  INTENT_MISMATCH: "intent_mismatch",
  LANGUAGE_MISMATCH: "language_mismatch",
  ACTION_MISMATCH: "action_mismatch",
  LIVE_EMPTY_V2_ACTIVE: "live_empty_v2_active",
  V2_SAFE_FAILURE: "v2_safe_failure",
  V2_EVALUATION_FAILED: "v2_evaluation_failed",
  DIAGNOSTIC_LEAK: "diagnostic_leak",
  UNKNOWN: "unknown"
});

const LIVE_SCHEDULING_INTENTS = new Set([
  "APPOINTMENT_CONFIRMATION",
  "INTERVIEW_DETAILS",
  "RESCHEDULE_CONFIRMATION",
  "CONVERSATION_ENGINE_REPLY"
]);

const V2_SCHEDULING_INTENTS = new Set([
  "scheduling_counteroffer",
  "schedule_confirm",
  "reschedule_request",
  "select_option"
]);

const V2_SCHEDULING_ACTIONS = new Set([
  "acknowledge_and_check_availability",
  "offer_alternatives_or_escalate",
  "ask_explicit_confirmation",
  "create_appointment",
  "offer_reschedule_flow"
]);

function unwrapEnginePayload(engineResult) {
  if (!engineResult || typeof engineResult !== "object") {
    return null;
  }

  // conversationEngine.finalizeReply may nest semantic object results under .reply
  if (
    engineResult.reply &&
    typeof engineResult.reply === "object" &&
    (engineResult.reply.reply != null || engineResult.reply.outboundIntent)
  ) {
    return {
      ...engineResult.reply,
      handoff: engineResult.handoff ?? engineResult.reply.handoff
    };
  }

  return engineResult;
}

function extractLiveCeResponseIntent(conversation = {}) {
  const engine = unwrapEnginePayload(conversation.engineResult);

  if (engine?.outboundIntent) {
    return String(engine.outboundIntent);
  }

  if (engine?.humanAssist || conversation.humanAssist) {
    return "HUMAN_ASSIST";
  }

  if (conversation.reason === "EMPTY_REPLY") {
    return "EMPTY_REPLY";
  }

  if (conversation.reason === "REPLY_SUPPRESSED") {
    return "REPLY_SUPPRESSED";
  }

  if (conversation.reason === "CONVERSATION_ENGINE_ERROR") {
    return "CONVERSATION_ENGINE_ERROR";
  }

  if (conversation.replied) {
    return "CONVERSATION_ENGINE_REPLY";
  }

  if (conversation.success === false) {
    return "CONVERSATION_ENGINE_ERROR";
  }

  return "NO_LIVE_REPLY";
}

function extractLiveLanguage(conversation = {}, fallback = null) {
  const engine = unwrapEnginePayload(conversation.engineResult);
  const fromEngine =
    engine?.preferredLanguage ||
    engine?.language ||
    conversation.language ||
    fallback;
  return normalizeLanguage(fromEngine || "unknown");
}

function languagesAgree(liveLanguage, v2Language) {
  const live = normalizeLanguage(liveLanguage || "unknown");
  const v2 = normalizeLanguage(v2Language || "unknown");
  if (live === "unknown" || v2 === "unknown") {
    return true;
  }
  return live === v2;
}

function intentsRoughlyAligned(liveIntent, v2Intent, v2Action) {
  const live = String(liveIntent || "");
  const v2 = String(v2Intent || "");
  const action = String(v2Action || "");

  if (live === "HUMAN_ASSIST" || live === "CONVERSATION_ENGINE_ERROR") {
    return (
      action === "escalate_to_human" ||
      action === "safe_failure_and_escalate" ||
      action === "offer_alternatives_or_escalate"
    );
  }

  if (live === "APPOINTMENT_CONFIRMATION") {
    return v2 === "schedule_confirm" || action === "create_appointment";
  }

  if (live === "RESCHEDULE_CONFIRMATION" || live === "INTERVIEW_DETAILS") {
    return v2 === "reschedule_request" || action === "offer_reschedule_flow";
  }

  if (LIVE_SCHEDULING_INTENTS.has(live)) {
    return V2_SCHEDULING_INTENTS.has(v2) || V2_SCHEDULING_ACTIONS.has(action);
  }

  if (live === "EMPTY_REPLY" || live === "NO_LIVE_REPLY" || live === "REPLY_SUPPRESSED") {
    return action === "noop" || action === "clarify_once";
  }

  return Boolean(v2);
}

function classifyDivergence({
  liveCeResponseIntent,
  liveLanguage,
  v2InterpretedIntent,
  v2DecisionCode,
  v2Language,
  v2RenderedText,
  evaluationFailed = false,
  languageAgreement = null
} = {}) {
  if (evaluationFailed) {
    return DIVERGENCE.V2_EVALUATION_FAILED;
  }

  const diagnosticLeak = containsInternalDiagnostics(v2RenderedText);
  if (diagnosticLeak) {
    return DIVERGENCE.DIAGNOSTIC_LEAK;
  }

  const langOk =
    languageAgreement == null
      ? languagesAgree(liveLanguage, v2Language)
      : Boolean(languageAgreement);

  if (!langOk) {
    return DIVERGENCE.LANGUAGE_MISMATCH;
  }

  if (
    String(v2DecisionCode || "") === "safe_failure_and_escalate" ||
    String(v2DecisionCode || "") === "escalate_to_human"
  ) {
    if (
      liveCeResponseIntent === "HUMAN_ASSIST" ||
      liveCeResponseIntent === "CONVERSATION_ENGINE_ERROR"
    ) {
      return DIVERGENCE.ALIGNED;
    }
    return DIVERGENCE.V2_SAFE_FAILURE;
  }

  if (
    (liveCeResponseIntent === "EMPTY_REPLY" ||
      liveCeResponseIntent === "NO_LIVE_REPLY") &&
    v2DecisionCode &&
    v2DecisionCode !== "noop"
  ) {
    return DIVERGENCE.LIVE_EMPTY_V2_ACTIVE;
  }

  if (
    !intentsRoughlyAligned(liveCeResponseIntent, v2InterpretedIntent, v2DecisionCode)
  ) {
    // Prefer action mismatch when both sides have scheduling-like signals.
    if (
      LIVE_SCHEDULING_INTENTS.has(String(liveCeResponseIntent)) ||
      V2_SCHEDULING_ACTIONS.has(String(v2DecisionCode))
    ) {
      return DIVERGENCE.ACTION_MISMATCH;
    }
    return DIVERGENCE.INTENT_MISMATCH;
  }

  return DIVERGENCE.ALIGNED;
}

function extractProposedSideEffect(authorization) {
  const proposals = Array.isArray(authorization?.proposals)
    ? authorization.proposals
    : [];
  const first = proposals.find((p) => p?.type) || null;
  if (!first) {
    return "none";
  }
  return `${first.type}:denied`;
}

module.exports = {
  DIVERGENCE,
  unwrapEnginePayload,
  extractLiveCeResponseIntent,
  extractLiveLanguage,
  languagesAgree,
  classifyDivergence,
  extractProposedSideEffect
};
