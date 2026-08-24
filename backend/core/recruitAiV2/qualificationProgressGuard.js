/**
 * Recruit AI v2 — qualification no-dead-end invariant (BR-088 extension).
 * Active qualification turns must end with a concrete next question/action,
 * never a bare acknowledgment such as "Gracias — eso ayuda. Continuemos."
 */

const { STAGES } = require("./conversationContext");
const { NEXT_ACTIONS, REASON_CODES } = require("./constants");
const { resolveQualificationResume } = require("./decisionEngine");
const {
  renderCustomerReply,
  resolveResumeQuestion
} = require("./responseRenderer");

const TERMINAL_NEXT_ACTIONS = new Set([
  NEXT_ACTIONS.ESCALATE_TO_HUMAN,
  NEXT_ACTIONS.SAFE_FAILURE_AND_ESCALATE,
  NEXT_ACTIONS.NOOP,
  "escalate_to_human",
  "safe_failure_and_escalate",
  "noop",
  "close_conversation",
  "disengage"
]);

const ACK_ONLY_RE =
  /^(?:perfecto|gracias|thanks|got it|entendido)[^.!?—-]*(?:[.—-]\s*)?(?:eso ayuda|that helps)?[.—-]?\s*(?:continuemos|let'?s continue)\.?$/i;

function normalizeReplyText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u2014\u2013]/g, "-");
}

function containsConcreteQuestion(text) {
  const t = normalizeReplyText(text);
  return /[?¿]/.test(t) || /\b(prefieres|te funciona|cuentas con|tienes permiso|do you have|which|what time|qué hora|qué día)\b/i.test(
    t
  );
}

function isAcknowledgmentOnlyReply(text) {
  const t = normalizeReplyText(text);
  if (!t) {
    return false;
  }
  if (containsConcreteQuestion(t)) {
    return false;
  }
  return ACK_ONLY_RE.test(t) || /continuemos\.?$/i.test(t);
}

function isQualificationTurnActive(context, structuredDecision) {
  const stage = String(
    structuredDecision?.contextPatch?.currentStage ||
      context?.currentStage ||
      STAGES.QUALIFICATION
  ).toLowerCase();
  if (stage !== STAGES.QUALIFICATION && stage !== "qualification") {
    return false;
  }
  if (structuredDecision?.decision?.shouldEscalate) {
    return false;
  }
  const nextAction = String(structuredDecision?.decision?.nextAction || "");
  if (TERMINAL_NEXT_ACTIONS.has(nextAction)) {
    return false;
  }
  const appointmentStatus = String(context?.appointment?.status || "").toLowerCase();
  if (appointmentStatus === "confirmed" || appointmentStatus === "booked") {
    return false;
  }
  return true;
}

function resolveNextRequiredQualificationField(context) {
  const resume = resolveQualificationResume(context);
  return {
    field: resume.lastQuestionAsked || null,
    templateKey: resume.templateKey || null,
    entities: resume.entities || {}
  };
}

function classifyRenderedResponseType(text) {
  if (isAcknowledgmentOnlyReply(text)) {
    return "acknowledgment_only";
  }
  if (containsConcreteQuestion(text)) {
    return "question";
  }
  if (/\b(confirmad|confirmed|quedó confirmada|appointment)\b/i.test(text)) {
    return "milestone_confirmation";
  }
  if (/\b(compañero|teammate|follow up|seguirá)\b/i.test(text)) {
    return "handoff";
  }
  return "statement";
}

/**
 * Repair acknowledgment-only qualification replies by appending the canonical next question.
 */
function enforceQualificationNoDeadEnd({
  rendered,
  responsePlan,
  structuredDecision,
  context
} = {}) {
  const diagnostics = {
    qualification_next_required_field: null,
    qualification_next_action:
      structuredDecision?.decision?.nextAction ||
      responsePlan?.nextAction ||
      null,
    qualification_progress_stall: false,
    rendered_response_type: classifyRenderedResponseType(rendered?.text),
    acknowledgment_only_detected: false
  };

  if (!isQualificationTurnActive(context, structuredDecision)) {
    return { rendered, responsePlan, structuredDecision, diagnostics };
  }

  const nextRequired = resolveNextRequiredQualificationField(context);
  diagnostics.qualification_next_required_field = nextRequired.field;

  if (!isAcknowledgmentOnlyReply(rendered?.text)) {
    return { rendered, responsePlan, structuredDecision, diagnostics };
  }

  diagnostics.acknowledgment_only_detected = true;
  diagnostics.qualification_progress_stall = true;
  diagnostics.rendered_response_type = "acknowledgment_only";

  const language = responsePlan?.language || context?.preferredLanguage || "spanish";
  const entities = {
    ...(responsePlan?.entities || {}),
    ...(nextRequired.entities || {}),
    city: context?.knownFacts?.city || responsePlan?.entities?.city || null,
    state: context?.knownFacts?.state || responsePlan?.entities?.state || null,
    proposedState:
      context?.knownFacts?.proposedState || responsePlan?.entities?.proposedState || null,
    workAuthorization: context?.knownFacts?.workAuthorization,
    workAuthorizationStatus: context?.knownFacts?.workAuthorizationStatus,
    preferredDayPart: context?.knownFacts?.preferredDayPart
  };

  const repairedPlan = {
    ...responsePlan,
    templateKey: nextRequired.templateKey,
    entities: {
      ...entities,
      resumeTemplateKey: nextRequired.templateKey
    }
  };
  const repairedRendered = renderCustomerReply(repairedPlan);

  if (!structuredDecision.reasonCodes) {
    structuredDecision.reasonCodes = [];
  }
  if (
    !structuredDecision.reasonCodes.includes(
      REASON_CODES.QUALIFICATION_PROGRESS_STALL
    )
  ) {
    structuredDecision.reasonCodes.push(REASON_CODES.QUALIFICATION_PROGRESS_STALL);
  }
  if (
    !structuredDecision.reasonCodes.includes(
      REASON_CODES.QUALIFICATION_PROGRESS_STALL_REPAIRED
    )
  ) {
    structuredDecision.reasonCodes.push(
      REASON_CODES.QUALIFICATION_PROGRESS_STALL_REPAIRED
    );
  }

  structuredDecision.customerReplyPlan = {
    ...(structuredDecision.customerReplyPlan || {}),
    templateKey: nextRequired.templateKey,
    entities: repairedPlan.entities
  };

  diagnostics.rendered_response_type = classifyRenderedResponseType(
    repairedRendered?.text
  );
  diagnostics.qualification_progress_stall = false;

  return {
    rendered: repairedRendered,
    responsePlan: repairedPlan,
    structuredDecision,
    diagnostics
  };
}

module.exports = {
  isAcknowledgmentOnlyReply,
  isQualificationTurnActive,
  resolveNextRequiredQualificationField,
  classifyRenderedResponseType,
  enforceQualificationNoDeadEnd,
  resolveResumeQuestion
};
