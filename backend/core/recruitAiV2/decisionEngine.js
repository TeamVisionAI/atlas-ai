/**
 * Recruit AI v2 — business decision engine.
 * Produces auditable StructuredDecision JSON. Never executes side effects.
 * Implements BR-081 / BR-082.
 */

const {
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE,
  MAX_CLARIFICATIONS_BEFORE_ESCALATE
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
      clarificationCount: context.conversation?.clarificationCount || 0,
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
      language: interpretation.preferredLanguage,
      entities: interpretation.entities || {}
    },
    contextPatch: {}
  };
}

function bumpClarification(context, templateKey) {
  const prior = Number(context.conversation?.clarificationCount || 0);
  return {
    clarificationCount: prior + 1,
    lastClarificationTemplateKey: templateKey,
    pendingClarification: templateKey
  };
}

function mergeConversationMetaReset(context) {
  return {
    ...context,
    conversation: {
      ...(context.conversation || {}),
      clarificationCount: 0,
      lastClarificationTemplateKey: null,
      pendingClarification: null
    }
  };
}

function shouldEscalateAfterClarifications(context, family = null) {
  const count = Number(context.conversation?.clarificationCount || 0);
  const priorFamily = context.conversation?.pendingClarification || null;
  // New clarification family starts fresh (location → day-part, etc.).
  if (family && priorFamily && family !== priorFamily && !String(priorFamily).startsWith(String(family))) {
    return false;
  }
  return count + 1 >= MAX_CLARIFICATIONS_BEFORE_ESCALATE;
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

  if (interpretation.languageAdapted) {
    structured.reasonCodes.push(REASON_CODES.LANGUAGE_ADAPTED_ACTIVE_CONVERSATION);
  } else {
    structured.reasonCodes.push(REASON_CODES.LANGUAGE_STICKY);
  }

  if (availability) {
    structured.availability = {
      requestedSlotAvailable: Boolean(availability.requestedSlotAvailable),
      nearestAlternatives: availability.nearestAlternatives || [],
      checked: true
    };
  }

  if (intent === INTENTS.GREETING) {
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_AFTER_GREETING;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "greeting_ask_location";
    structured.reasonCodes.push(REASON_CODES.GREETING_NO_ESCALATE);
    structured.contextPatch = {
      currentStage: STAGES.QUALIFICATION,
      conversation: {
        lastQuestionAsked: "ask_location",
        lastProspectIntent: INTENTS.GREETING
      }
    };
    return structured;
  }

  if (intent === INTENTS.OPPORTUNITY_QUESTION) {
    structured.decision.nextAction = NEXT_ACTIONS.ANSWER_BRIEF_VALUE_PROP_THEN_QUALIFY;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "value_prop_then_qualify";
    return structured;
  }

  if (intent === INTENTS.ECHO_OR_NOOP) {
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
    structured.customerReplyPlan.templateKey = "clarify_once";
    structured.reasonCodes.push(REASON_CODES.ECHO_DETECTED);
    return structured;
  }

  if (intent === INTENTS.PROVIDE_LOCATION) {
    const completeness = interpretation.entities?.completeness;
    const city = interpretation.entities?.city || context.knownFacts?.city;
    const state = interpretation.entities?.state;
    const proposedState =
      interpretation.entities?.proposedState || context.knownFacts?.proposedState;

    if (completeness === "partial" || (city && !state)) {
      structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_LOCATION;
      structured.reasonCodes.push(REASON_CODES.PARTIAL_LOCATION);
      structured.reasonCodes.push(REASON_CODES.LOCATION_STATE_UNCONFIRMED);
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey = proposedState
        ? "confirm_location_proposal"
        : "ask_state";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        city,
        proposedState
      };
      structured.contextPatch = {
        currentStage: STAGES.QUALIFICATION,
        knownFacts: {
          city: city || null,
          state: null,
          cityCertainty: "partial",
          stateCertainty: proposedState ? "proposed" : "unknown",
          proposedState: proposedState || null
        },
        conversation: {
          ...bumpClarification(context, structured.customerReplyPlan.templateKey),
          lastQuestionAsked: proposedState ? "confirm_location" : "ask_state",
          lastProspectIntent: INTENTS.PROVIDE_LOCATION
        }
      };
      return structured;
    }

    // Complete location — continue qualification (auth / next canonical step).
    // Do not jump to day-part / scheduling from location alone.
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = "continue_qualification_after_location";
    structured.contextPatch = {
      currentStage: STAGES.QUALIFICATION,
      knownFacts: {
        city: city || null,
        state: state || null,
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        proposedState: null
      },
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastQuestionAsked: "ask_authorization",
        lastProspectIntent: INTENTS.PROVIDE_LOCATION,
        confirmedFields: Array.from(
          new Set([...(context.conversation?.confirmedFields || []), "city", "state"])
        )
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_NAME) {
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = "continue_qualification";
    return structured;
  }

  if (intent === INTENTS.PROVIDE_MEETING_PREFERENCE) {
    const meetingType = interpretation.entities?.appointmentType || null;
    structured.decision.nextAction = NEXT_ACTIONS.UPDATE_MEETING_PREFERENCE;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey =
      meetingType === "zoom"
        ? "meeting_preference_zoom"
        : "meeting_preference_in_person";
    structured.contextPatch = {
      knownFacts: {
        preferredMeetingType: meetingType
      },
      appointment: {
        meetingType
      },
      conversation: {
        lastProspectIntent: INTENTS.PROVIDE_MEETING_PREFERENCE,
        lastQuestionAsked: "ask_day_part"
      }
    };
    return structured;
  }

  if (intent === INTENTS.CANCEL_REQUEST) {
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_CANCEL_NO_WRITE;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "acknowledge_cancel_no_write";
    structured.contextPatch = {
      conversation: {
        lastProspectIntent: INTENTS.CANCEL_REQUEST,
        pendingClarification: "cancel_confirm"
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_DAY_PART) {
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = "continue_after_day_part";
    structured.contextPatch = {
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastQuestionAsked: null,
        lastProspectIntent: INTENTS.PROVIDE_DAY_PART
      },
      knownFacts: {
        preferredMeetingType: interpretation.entities?.dayPart || null
      }
    };
    return structured;
  }

  if (
    intent === INTENTS.INCOMPLETE_DAY_PART ||
    intent === INTENTS.AMBIGUOUS_FRAGMENT
  ) {
    structured.reasonCodes.push(REASON_CODES.RECOVERABLE_AMBIGUITY);
    if (intent === INTENTS.AMBIGUOUS_FRAGMENT) {
      structured.reasonCodes.push(REASON_CODES.FRAGMENT_NOT_NAME);
    }

    const family =
      intent === INTENTS.INCOMPLETE_DAY_PART ||
      String(context.conversation?.lastQuestionAsked || "").includes("day_part")
        ? "clarify_day_part"
        : "clarify_once";

    const priorFamily = context.conversation?.pendingClarification || null;
    const sameFamily =
      !priorFamily ||
      priorFamily === family ||
      String(priorFamily).startsWith(family);
    const effectiveContext = sameFamily
      ? context
      : mergeConversationMetaReset(context);

    if (shouldEscalateAfterClarifications(effectiveContext, family)) {
      structured.decision.nextAction = NEXT_ACTIONS.ESCALATE_TO_HUMAN;
      structured.decision.shouldEscalate = true;
      structured.customerReplyPlan.templateKey = "safe_uncertain_escalate";
      structured.reasonCodes.push(REASON_CODES.REPEATED_AMBIGUITY_ESCALATE);
      structured.contextPatch = {
        attention: {
          needsHumanAttention: true,
          reason: "repeated_clarification_ambiguity"
        },
        currentStage: STAGES.HUMAN_REQUIRED,
        conversation: {
          ...bumpClarification(effectiveContext, "safe_uncertain_escalate"),
          lastProspectIntent: intent
        }
      };
      return structured;
    }

    // Avoid identical clarification copy loop.
    const priorKey = effectiveContext.conversation?.lastClarificationTemplateKey;
    const nextKey =
      family === "clarify_day_part" && priorKey === "clarify_day_part"
        ? "clarify_day_part_alt"
        : family;

    structured.decision.nextAction =
      intent === INTENTS.INCOMPLETE_DAY_PART
        ? NEXT_ACTIONS.CLARIFY_DAY_PART
        : NEXT_ACTIONS.CLARIFY_ONCE;
    structured.customerReplyPlan.templateKey = nextKey;
    structured.contextPatch = {
      currentStage: context.currentStage || STAGES.QUALIFICATION,
      conversation: {
        ...bumpClarification(effectiveContext, nextKey),
        lastQuestionAsked:
          intent === INTENTS.INCOMPLETE_DAY_PART
            ? "ask_day_part"
            : context.conversation?.lastQuestionAsked || "clarify",
        lastProspectIntent: intent
      }
    };
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

  // Recoverable unknown — clarify first; escalate only after repeats.
  if (interpretation.confidence < 0.5) {
    structured.reasonCodes.push(REASON_CODES.RECOVERABLE_AMBIGUITY);
    if (shouldEscalateAfterClarifications(context)) {
      structured.decision.nextAction = NEXT_ACTIONS.ESCALATE_TO_HUMAN;
      structured.decision.shouldEscalate = true;
      structured.customerReplyPlan.templateKey = "safe_uncertain_escalate";
      structured.reasonCodes.push(REASON_CODES.LOW_CONFIDENCE);
      structured.reasonCodes.push(REASON_CODES.REPEATED_AMBIGUITY_ESCALATE);
      structured.contextPatch = {
        attention: {
          needsHumanAttention: true,
          reason: "low_confidence_interpretation"
        },
        currentStage: STAGES.HUMAN_REQUIRED,
        conversation: bumpClarification(context, "safe_uncertain_escalate")
      };
      return structured;
    }

    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
    structured.customerReplyPlan.templateKey = "clarify_once";
    structured.contextPatch = {
      conversation: {
        ...bumpClarification(context, "clarify_once"),
        lastProspectIntent: intent
      }
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
