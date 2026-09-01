/**
 * BR-175 — classify quality signals from structured shadow + conversation state.
 * Inbound text is used only for classification and is never persisted here.
 */

const {
  SIGNAL_TYPES,
  SEVERITIES,
  LOW_CONFIDENCE_THRESHOLD
} = require("./constants");

const FRUSTRATION_PATTERNS = [
  /ya\s+me\s+preguntaste/i,
  /eso\s+no\s+fue\s+lo\s+que\s+dije/i,
  /no\s+entendiste/i,
  /respuestas?\s+automatizadas?/i,
  /you\s+already\s+asked/i,
  /that(?:'s| is)\s+not\s+what\s+i\s+said/i,
  /you\s+(?:didn'?t|did not)\s+understand/i,
  /automated\s+replies/i,
  /you\s+keep\s+asking/i,
  /me\s+sigues\s+preguntando/i
];

function normalizeInbound(text) {
  return String(text || "").trim();
}

function detectFrustration(inboundText) {
  const text = normalizeInbound(inboundText);
  if (!text) {
    return false;
  }
  return FRUSTRATION_PATTERNS.some((pattern) => pattern.test(text));
}

function factAlreadyKnown(context, question) {
  const facts = context?.knownFacts || {};
  const asked = String(question || context?.conversation?.lastQuestionAsked || "");
  if (/authoriz|ciudadan|permiso/i.test(asked) && facts.workAuthorization != null) {
    return true;
  }
  if (/location|ciudad|estado|city|state/i.test(asked) && facts.city && facts.state) {
    return true;
  }
  if (/ask_state/i.test(asked) && facts.state) {
    return true;
  }
  if (/ask_city/i.test(asked) && facts.city) {
    return true;
  }
  return false;
}

function classifySignals({
  observation = null,
  inboundText = "",
  context = null,
  interpretation = null,
  structuredDecision = null,
  execution = null
} = {}) {
  const signals = [];
  const semantic = observation?.semantic || null;
  const legacy = observation?.legacy || interpretation || null;
  const comparison = observation?.comparison || null;
  const reason = observation?.reason || observation?.providerReason || null;
  const nextAction = structuredDecision?.decision?.nextAction || null;

  if (reason === "PROVIDER_TIMEOUT") {
    signals.push({ type: SIGNAL_TYPES.SEMANTIC_TIMEOUT, severity: SEVERITIES.MEDIUM });
  }
  if (reason === "INVALID_SEMANTIC_JSON") {
    signals.push({ type: SIGNAL_TYPES.SEMANTIC_INVALID_JSON, severity: SEVERITIES.MEDIUM });
  }
  if (
    observation?.eligible &&
    Number(observation.confidence) > 0 &&
    Number(observation.confidence) < LOW_CONFIDENCE_THRESHOLD
  ) {
    signals.push({ type: SIGNAL_TYPES.SEMANTIC_LOW_CONFIDENCE, severity: SEVERITIES.LOW });
  }
  if (observation?.eligible && comparison && comparison.agree === false) {
    signals.push({ type: SIGNAL_TYPES.SEMANTIC_DISAGREEMENT, severity: SEVERITIES.MEDIUM });
  }
  if (
    Number(semantic?.confidence) >= LOW_CONFIDENCE_THRESHOLD &&
    Array.isArray(semantic?.objections) &&
    semantic.objections.length > 0 &&
    (!legacy?.intent || legacy.intent === "unknown")
  ) {
    signals.push({ type: SIGNAL_TYPES.SEMANTIC_OBJECTION_MISSED, severity: SEVERITIES.HIGH });
  }
  if (detectFrustration(inboundText)) {
    signals.push({
      type: /preguntaste|already asked|keep asking|sigues preguntando/i.test(inboundText)
        ? SIGNAL_TYPES.REPEATED_QUESTION_COMPLAINT
        : SIGNAL_TYPES.FRUSTRATION_MISUNDERSTANDING,
      severity: SEVERITIES.HIGH
    });
  }
  if (
    factAlreadyKnown(context, context?.conversation?.lastQuestionAsked) &&
    /^ask_/i.test(String(nextAction || context?.conversation?.lastQuestionAsked || ""))
  ) {
    signals.push({ type: SIGNAL_TYPES.REPEATED_QUESTION, severity: SEVERITIES.HIGH });
  }
  if (
    context?.conversation?.humanRequired === true &&
    /^ask_/i.test(String(nextAction || ""))
  ) {
    signals.push({
      type: SIGNAL_TYPES.HUMAN_REQUIRED_THEN_QUALIFICATION,
      severity: SEVERITIES.HIGH
    });
  }
  if (
    (semantic?.schedulingIntent === "reschedule" || semantic?.schedulingIntent === "cancel") &&
    nextAction &&
    !/reschedule|cancel/i.test(String(nextAction))
  ) {
    signals.push({ type: SIGNAL_TYPES.RESCHEDULE_NOT_ACTED, severity: SEVERITIES.HIGH });
  }

  const templateKey = String(structuredDecision?.customerReplyPlan?.templateKey || "");
  const intent = String(interpretation?.intent || "");
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  if (
    /job_opportunity|opportunity_question/i.test(intent) &&
    (/safe_uncertain_escalate|human_required/i.test(templateKey) ||
      (lastQ &&
        lastQ !== "ask_location" &&
        /ask_location/i.test(String(nextAction || templateKey))))
  ) {
    signals.push({ type: SIGNAL_TYPES.FAQ_INTERRUPT_MISAPPLIED, severity: SEVERITIES.HIGH });
  }
  if (
    (intent === "conversation_clarification_request" ||
      /disculp|cual dato|which data/i.test(inboundText)) &&
    /safe_uncertain_escalate|human_required/i.test(`${templateKey} ${nextAction || ""}`)
  ) {
    signals.push({ type: SIGNAL_TYPES.PREMATURE_HANDOFF, severity: SEVERITIES.HIGH });
  }
  if (
    (/create_appointment|schedule_confirm/i.test(String(nextAction || intent)) &&
      templateKey === "acknowledge_preference_awaiting_availability") ||
    (templateKey === "appointment_confirmed" && execution && execution.success !== true)
  ) {
    signals.push({
      type: SIGNAL_TYPES.APPOINTMENT_CONFIRMATION_MISMATCH,
      severity: SEVERITIES.HIGH
    });
  }

  const unique = [];
  const seen = new Set();
  for (const signal of signals) {
    if (seen.has(signal.type)) {
      continue;
    }
    seen.add(signal.type);
    unique.push(signal);
  }
  return unique;
}

function highestSeverity(signals = []) {
  if (signals.some((item) => item.severity === SEVERITIES.HIGH)) {
    return SEVERITIES.HIGH;
  }
  if (signals.some((item) => item.severity === SEVERITIES.MEDIUM)) {
    return SEVERITIES.MEDIUM;
  }
  return SEVERITIES.LOW;
}

module.exports = {
  FRUSTRATION_PATTERNS,
  detectFrustration,
  factAlreadyKnown,
  classifySignals,
  highestSeverity
};
