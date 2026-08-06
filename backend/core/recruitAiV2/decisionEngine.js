/**
 * Recruit AI v2 — business decision engine.
 * Produces auditable StructuredDecision JSON. Never executes side effects.
 * Implements BR-081.
 */

const {
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE
} = require("./constants");
const {
  isTimeInOfferedSlots,
  slotsEqual,
  APPOINTMENT_STATUS,
  STAGES
} = require("./conversationContext");

function buildBaseDecision({ context, interpretation }) {
  return {
    conversationId: context.prospectId || null,
    prospectId: context.prospectId || null,
    organizationId: context.organizationId || null,
    preferredLanguage: interpretation.preferredLanguage,
    intent: interpretation.intent,
    entities: interpretation.entities,
    context: {
      previouslyOfferedSlots: context.appointment?.previouslyOfferedSlots || [],
      lastQuestionAsked: context.conversation?.lastQuestionAsked || null,
      knownLocation: context.knownFacts?.city || null,
      confirmedFields: context.conversation?.confirmedFields || [],
      unresolvedFields: context.conversation?.unresolvedFields || [],
      appointmentStatus: context.appointment?.status || APPOINTMENT_STATUS.NONE,
      counterofferMismatchCount: context.conversation?.counterofferMismatchCount || 0,
      currentStage: context.currentStage
    },
    availability: {
      requestedSlotAvailable: null,
      nearestAlternatives: [],
      checked: false
    },
    decision: {
      nextAction: NEXT_ACTIONS.NOOP,
      requiresExplicitConfirmation: true,
      mayCreateAppointment: false,
      shouldEscalate: false,
      maySendOutbound: false,
      sideEffectsEnabled: false
    },
    confidence: interpretation.confidence,
    reasonCodes: [REASON_CODES.SIDE_EFFECTS_DISABLED, REASON_CODES.FORBID_INTERNAL_DIAGNOSTICS],
    customerReplyPlan: {
      acknowledgeRequest: false,
      forbidInternalDiagnostics: true,
      templateKey: null,
      language: interpretation.preferredLanguage
    },
    contextPatch: {}
  };
}

/**
 * Decide next business action from context + interpretation.
 * Availability is optional injected tool result (read-only).
 */
function decideConversationTurn({
  context,
  interpretation,
  availability = null
} = {}) {
  const structured = buildBaseDecision({ context, interpretation });
  const intent = interpretation.intent;
  const offered = context.appointment?.previouslyOfferedSlots || [];
  const requestedTime = interpretation.entities?.requestedTime || null;
  let mismatchCount = context.conversation?.counterofferMismatchCount || 0;

  if (availability) {
    structured.availability = {
      requestedSlotAvailable: Boolean(availability.requestedSlotAvailable),
      nearestAlternatives: availability.nearestAlternatives || [],
      checked: true
    };
  }

  if (intent === INTENTS.OPPORTUNITY_QUESTION) {
    structured.decision.nextAction = NEXT_ACTIONS.ANSWER_BRIEF_VALUE_PROP_THEN_QUALIFY;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "value_prop_then_qualify";
    structured.reasonCodes.push(REASON_CODES.LANGUAGE_STICKY);
    return structured;
  }

  if (intent === INTENTS.ECHO_OR_NOOP) {
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
    structured.customerReplyPlan.templateKey = "clarify_once";
    structured.reasonCodes.push(REASON_CODES.ECHO_DETECTED);
    return structured;
  }

  if (intent === INTENTS.PROVIDE_LOCATION || intent === INTENTS.PROVIDE_NAME) {
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = "continue_qualification";
    return structured;
  }

  if (intent === INTENTS.SELECT_OPTION) {
    structured.decision.nextAction = NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION;
    structured.decision.requiresExplicitConfirmation = true;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.templateKey = "confirm_selected_slot";
    structured.reasonCodes.push(REASON_CODES.EXPLICIT_CONFIRMATION_REQUIRED);
    structured.reasonCodes.push(REASON_CODES.PREMATURE_BOOKING_BLOCKED);
    structured.contextPatch = {
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED
      },
      conversation: {
        lastQuestionAsked: "confirm_slot"
      },
      currentStage: STAGES.PROPOSED
    };
    return structured;
  }

  if (intent === INTENTS.RESCHEDULE_REQUEST) {
    structured.decision.nextAction = NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "offer_reschedule_flow";
    structured.reasonCodes.push(REASON_CODES.RESCHEDULE_AFTER_CONFIRMATION);
    structured.reasonCodes.push(REASON_CODES.APPOINTMENT_ALREADY_CONFIRMED);
    structured.contextPatch = {
      appointment: {
        status: APPOINTMENT_STATUS.RESCHEDULE_REQUESTED
      },
      currentStage: STAGES.RESCHEDULING
    };
    return structured;
  }

  if (intent === INTENTS.SCHEDULING_COUNTEROFFER) {
    const inOffered = isTimeInOfferedSlots(requestedTime, offered);
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.COUNTEROFFER_DETECTED);

    if (!inOffered) {
      structured.reasonCodes.push(REASON_CODES.COUNTEROFFER_OUTSIDE_OFFERED_SET);
      mismatchCount += 1;
    }

    if (
      availability?.checked &&
      availability.requestedSlotAvailable === false &&
      Array.isArray(availability.nearestAlternatives) &&
      slotsEqual(availability.nearestAlternatives, offered)
    ) {
      structured.reasonCodes.push(REASON_CODES.SAME_SLOTS_ALREADY_REJECTED);
      mismatchCount += 1;
    }

    structured.contextPatch = {
      conversation: {
        counterofferMismatchCount: mismatchCount,
        lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER
      }
    };

    if (mismatchCount >= MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE) {
      structured.decision.nextAction = NEXT_ACTIONS.OFFER_ALTERNATIVES_OR_ESCALATE;
      structured.decision.shouldEscalate = true;
      structured.customerReplyPlan.templateKey = "escalate_after_counteroffer_mismatch";
      structured.reasonCodes.push(REASON_CODES.ESCALATE_AFTER_REPEATED_MISMATCH);
      structured.contextPatch.attention = {
        needsHumanAttention: true,
        reason: "repeated_counteroffer_mismatch"
      };
      structured.contextPatch.currentStage = STAGES.HUMAN_REQUIRED;
      return structured;
    }

    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_AND_CHECK_AVAILABILITY;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.templateKey = "acknowledge_counteroffer_check_availability";
    return structured;
  }

  if (intent === INTENTS.SCHEDULE_CONFIRM) {
    // Side effects remain disabled this sprint — never authorize create.
    structured.decision.nextAction = NEXT_ACTIONS.CREATE_APPOINTMENT;
    structured.decision.requiresExplicitConfirmation = true;
    structured.decision.mayCreateAppointment = false;
    structured.decision.maySendOutbound = false;
    structured.customerReplyPlan.templateKey = "appointment_confirm_deferred";
    structured.reasonCodes.push(REASON_CODES.EXPLICIT_CONFIRMATION_REQUIRED);
    structured.reasonCodes.push(REASON_CODES.PREMATURE_BOOKING_BLOCKED);
    structured.reasonCodes.push(REASON_CODES.SIDE_EFFECTS_DISABLED);
    return structured;
  }

  if (interpretation.confidence < 0.5) {
    structured.decision.nextAction = NEXT_ACTIONS.ESCALATE_TO_HUMAN;
    structured.decision.shouldEscalate = true;
    structured.customerReplyPlan.templateKey = "safe_uncertain_escalate";
    structured.reasonCodes.push(REASON_CODES.LOW_CONFIDENCE);
    structured.contextPatch = {
      attention: {
        needsHumanAttention: true,
        reason: "low_confidence_interpretation"
      },
      currentStage: STAGES.HUMAN_REQUIRED
    };
    return structured;
  }

  structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
  structured.customerReplyPlan.templateKey = "clarify_once";
  return structured;
}

/**
 * Map a failed booking / diagnostic attempt into a safe escalate decision.
 */
function decideSafeFailure({ context, interpretation, failureReason = null } = {}) {
  const structured = buildBaseDecision({
    context,
    interpretation: interpretation || {
      intent: INTENTS.UNKNOWN,
      confidence: 0,
      entities: {},
      preferredLanguage: context.preferredLanguage
    }
  });

  structured.decision.nextAction = NEXT_ACTIONS.SAFE_FAILURE_AND_ESCALATE;
  structured.decision.shouldEscalate = true;
  structured.decision.mayCreateAppointment = false;
  structured.customerReplyPlan.templateKey = "safe_failure_escalate";
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.reasonCodes.push(REASON_CODES.FORBID_INTERNAL_DIAGNOSTICS);
  if (failureReason) {
    structured.internalFailureReason = String(failureReason).slice(0, 120);
  }
  structured.contextPatch = {
    attention: {
      needsHumanAttention: true,
      reason: "safe_failure_escalation"
    },
    currentStage: STAGES.HUMAN_REQUIRED
  };
  return structured;
}

module.exports = {
  decideConversationTurn,
  decideSafeFailure,
  buildBaseDecision
};
