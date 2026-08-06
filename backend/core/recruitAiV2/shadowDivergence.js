/**
 * Recruit AI v2 — live CE vs v2 divergence classification.
 * Sanitized comparison only; never stores customer-visible copy bodies.
 * Implements BR-081 Phase 3.
 */

const { containsInternalDiagnostics } = require("./sanitize");
const { normalizeLanguage } = require("./conversationContext");

const DIVERGENCE = Object.freeze({
  EXACT_OR_EQUIVALENT: "exact_or_equivalent",
  LANGUAGE_MISMATCH: "language_mismatch",
  INTENT_MISMATCH: "intent_mismatch",
  TIME_COUNTEROFFER_MISSED_BY_LIVE: "time_counteroffer_missed_by_live",
  TIME_COUNTEROFFER_MISSED_BY_V2: "time_counteroffer_missed_by_v2",
  CONFIRMATION_DUPLICATE_RISK: "confirmation_duplicate_risk",
  RESCHEDULE_MISSED: "reschedule_missed",
  APPOINTMENT_STATE_MISMATCH: "appointment_state_mismatch",
  UNSAFE_SIDE_EFFECT_DIFFERENCE: "unsafe_side_effect_difference",
  DIAGNOSTIC_LEAK_LIVE: "diagnostic_leak_live",
  DIAGNOSTIC_LEAK_V2: "diagnostic_leak_v2",
  HUMAN_ESCALATION_DIFFERENCE: "human_escalation_difference",
  UNSUPPORTED_FOR_COMPARISON: "unsupported_for_comparison",
  SHADOW_ERROR: "shadow_error"
});

const COUNTEROFFER_INTENTS = new Set([
  "scheduling_counteroffer",
  "reschedule_request"
]);

function unwrapEnginePayload(engineResult) {
  if (!engineResult || typeof engineResult !== "object") {
    return null;
  }

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

function extractLiveReplyText(conversation = {}) {
  const engine = unwrapEnginePayload(conversation.engineResult);
  if (typeof conversation.replyText === "string") {
    return conversation.replyText;
  }
  if (typeof engine?.reply === "string") {
    return engine.reply;
  }
  return "";
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

function extractLiveSideEffectCategory(conversation = {}) {
  const intent = extractLiveCeResponseIntent(conversation);
  if (intent === "APPOINTMENT_CONFIRMATION") {
    return "appointment_confirm";
  }
  if (intent === "RESCHEDULE_CONFIRMATION") {
    return "appointment_reschedule";
  }
  if (intent === "HUMAN_ASSIST" || intent === "CONVERSATION_ENGINE_ERROR") {
    return "human_escalation";
  }
  if (intent === "EMPTY_REPLY" || intent === "NO_LIVE_REPLY" || intent === "REPLY_SUPPRESSED") {
    return "none";
  }
  if (conversation?.replied) {
    return "whatsapp_reply";
  }
  return "none";
}

function extractV2SideEffectCategory(authorization, structuredDecision) {
  const proposals = Array.isArray(authorization?.proposals)
    ? authorization.proposals
    : [];
  if (proposals.some((p) => p?.type === "create_appointment")) {
    return "appointment_create:denied";
  }
  if (proposals.some((p) => p?.type === "mark_human_attention")) {
    return "human_escalation:denied";
  }
  if (proposals.some((p) => p?.type === "send_whatsapp_reply")) {
    return "whatsapp_reply:denied";
  }
  const action = structuredDecision?.decision?.nextAction;
  if (action === "create_appointment") {
    return "appointment_create:denied";
  }
  if (
    action === "escalate_to_human" ||
    action === "safe_failure_and_escalate" ||
    action === "offer_alternatives_or_escalate"
  ) {
    return "human_escalation:denied";
  }
  if (structuredDecision?.decision?.shouldEscalate) {
    return "human_escalation:denied";
  }
  return "none";
}

function resolveAppointmentStateAgreement({
  liveAppointmentStatus = null,
  v2AppointmentStatus = null
} = {}) {
  if (!liveAppointmentStatus && !v2AppointmentStatus) {
    return true;
  }
  if (!liveAppointmentStatus || !v2AppointmentStatus) {
    return liveAppointmentStatus == null || v2AppointmentStatus == null
      ? true
      : false;
  }
  return String(liveAppointmentStatus) === String(v2AppointmentStatus);
}

function classifyDivergence({
  liveCeResponseIntent,
  liveLanguage,
  liveReplyText = "",
  v2InterpretedIntent,
  v2DecisionCode,
  v2Language,
  v2RenderedText = "",
  evaluationFailed = false,
  languageAgreement = null,
  appointmentStateAgreement = true,
  liveSideEffectCategory = "none",
  v2SideEffectCategory = "none",
  liveHumanAssist = false,
  v2ShouldEscalate = false
} = {}) {
  if (evaluationFailed) {
    return DIVERGENCE.SHADOW_ERROR;
  }

  if (containsInternalDiagnostics(liveReplyText)) {
    return DIVERGENCE.DIAGNOSTIC_LEAK_LIVE;
  }

  if (containsInternalDiagnostics(v2RenderedText)) {
    return DIVERGENCE.DIAGNOSTIC_LEAK_V2;
  }

  const langOk =
    languageAgreement == null
      ? languagesAgree(liveLanguage, v2Language)
      : Boolean(languageAgreement);

  if (!langOk) {
    return DIVERGENCE.LANGUAGE_MISMATCH;
  }

  if (appointmentStateAgreement === false) {
    return DIVERGENCE.APPOINTMENT_STATE_MISMATCH;
  }

  const live = String(liveCeResponseIntent || "");
  const v2Intent = String(v2InterpretedIntent || "");
  const v2Action = String(v2DecisionCode || "");

  if (
    COUNTEROFFER_INTENTS.has(v2Intent) &&
    (live === "EMPTY_REPLY" ||
      live === "NO_LIVE_REPLY" ||
      live === "REPLY_SUPPRESSED" ||
      live === "CONVERSATION_ENGINE_REPLY")
  ) {
    // Live answered generically while v2 understood a counteroffer.
    if (
      live === "EMPTY_REPLY" ||
      live === "NO_LIVE_REPLY" ||
      live === "REPLY_SUPPRESSED"
    ) {
      return DIVERGENCE.TIME_COUNTEROFFER_MISSED_BY_LIVE;
    }
  }

  if (
    (live === "CONVERSATION_ENGINE_REPLY" || live === "APPOINTMENT_CONFIRMATION") &&
    !COUNTEROFFER_INTENTS.has(v2Intent) &&
    v2Intent === "unknown"
  ) {
    return DIVERGENCE.TIME_COUNTEROFFER_MISSED_BY_V2;
  }

  if (
    live === "APPOINTMENT_CONFIRMATION" &&
    (v2Action === "create_appointment" || v2Intent === "schedule_confirm")
  ) {
    return DIVERGENCE.CONFIRMATION_DUPLICATE_RISK;
  }

  if (
    v2Intent === "reschedule_request" &&
    live !== "RESCHEDULE_CONFIRMATION" &&
    live !== "INTERVIEW_DETAILS" &&
    live !== "HUMAN_ASSIST"
  ) {
    return DIVERGENCE.RESCHEDULE_MISSED;
  }

  const liveEscalation =
    liveHumanAssist ||
    live === "HUMAN_ASSIST" ||
    live === "CONVERSATION_ENGINE_ERROR" ||
    liveSideEffectCategory === "human_escalation";
  if (Boolean(liveEscalation) !== Boolean(v2ShouldEscalate)) {
    return DIVERGENCE.HUMAN_ESCALATION_DIFFERENCE;
  }

  const liveBooks =
    liveSideEffectCategory === "appointment_confirm" ||
    liveSideEffectCategory === "appointment_reschedule";
  const v2WouldBook = String(v2SideEffectCategory || "").startsWith("appointment_");
  if (liveBooks !== v2WouldBook && (liveBooks || v2WouldBook)) {
    return DIVERGENCE.UNSAFE_SIDE_EFFECT_DIFFERENCE;
  }

  if (
    live === "EMPTY_REPLY" ||
    live === "NO_LIVE_REPLY" ||
    live === "REPLY_SUPPRESSED"
  ) {
    if (!v2Action || v2Action === "noop" || v2Action === "clarify_once") {
      return DIVERGENCE.EXACT_OR_EQUIVALENT;
    }
    return DIVERGENCE.UNSUPPORTED_FOR_COMPARISON;
  }

  if (
    COUNTEROFFER_INTENTS.has(v2Intent) &&
    (live === "CONVERSATION_ENGINE_REPLY" || live === "INTERVIEW_DETAILS")
  ) {
    return DIVERGENCE.TIME_COUNTEROFFER_MISSED_BY_LIVE;
  }

  if (v2Intent && live && v2Intent !== "unknown") {
    return DIVERGENCE.EXACT_OR_EQUIVALENT;
  }

  if (v2Intent === "unknown" || !v2Intent) {
    return DIVERGENCE.UNSUPPORTED_FOR_COMPARISON;
  }

  return DIVERGENCE.INTENT_MISMATCH;
}

function extractProposedSideEffect(authorization) {
  return extractV2SideEffectCategory(authorization, null);
}

module.exports = {
  DIVERGENCE,
  unwrapEnginePayload,
  extractLiveReplyText,
  extractLiveCeResponseIntent,
  extractLiveLanguage,
  languagesAgree,
  extractLiveSideEffectCategory,
  extractV2SideEffectCategory,
  resolveAppointmentStateAgreement,
  classifyDivergence,
  extractProposedSideEffect
};
