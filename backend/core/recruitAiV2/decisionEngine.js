/**
 * Recruit AI v2 — business decision engine.
 * Produces auditable StructuredDecision JSON. Never executes side effects.
 * Implements BR-081 / BR-082 / BR-083 / BR-084 / BR-085.
 */

const { formatDateLabel } = require("./dateResolution");

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
const { evaluateCoverage } = require("../businessRulesEngine");
const {
  WORK_AUTHORIZATION,
  FINANCIAL_LICENSE_STATUS
} = require("./qualificationFacts");

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
 * Resolve which qualification template/question to resume after a digression.
 * Canonical Team Vision order: location → authorization → day-part.
 */
function resolveQualificationResume(context) {
  const facts = context?.knownFacts || {};
  const cityOk = Boolean(facts.city) && facts.cityCertainty === "confirmed";
  const stateOk = Boolean(facts.state) && facts.stateCertainty === "confirmed";

  if (!facts.city || facts.cityCertainty === "unknown") {
    return {
      templateKey: "greeting_ask_location",
      lastQuestionAsked: "ask_location"
    };
  }
  if (!stateOk) {
    return {
      templateKey: facts.proposedState
        ? "confirm_location_proposal"
        : "ask_state",
      lastQuestionAsked: facts.proposedState ? "confirm_location" : "ask_state",
      entities: {
        city: facts.city,
        proposedState: facts.proposedState || null
      }
    };
  }
  if (
    facts.workAuthorization == null &&
    facts.workAuthorizationStatus !== WORK_AUTHORIZATION.AUTHORIZED &&
    facts.workAuthorizationStatus !== WORK_AUTHORIZATION.NOT_AUTHORIZED
  ) {
    return {
      templateKey: "continue_qualification_after_location",
      lastQuestionAsked: "ask_authorization"
    };
  }

  const modality = resolveMeetingModalityForLocation(facts);
  if (modality.coverage === "OUTSIDE") {
    return {
      templateKey: "outside_zoom_day_part",
      lastQuestionAsked: "ask_day_part",
      entities: { city: facts.city, coverage: "OUTSIDE" }
    };
  }
  if (modality.coverage === "LOCAL" && modality.meetingType === "zoom") {
    return {
      templateKey: "outside_zoom_day_part",
      lastQuestionAsked: "ask_day_part",
      entities: { city: facts.city, coverage: "LOCAL" }
    };
  }
  if (modality.coverage === "LOCAL") {
    return {
      templateKey: "continue_qualification_after_authorization",
      lastQuestionAsked: "ask_day_part",
      entities: { city: facts.city, coverage: "LOCAL" }
    };
  }
  return {
    templateKey: "ask_day_part_simple",
    lastQuestionAsked: "ask_day_part"
  };
}

/**
 * Re-evaluate coverage → meeting modality (BR-083 / BR-085).
 * OUTSIDE defaults to Zoom and clears stale office/in_person coverage defaults.
 * Prospect Zoom is preserved. Confirmed OUTSIDE in-person (travel OK) is honored.
 * Unconfirmed / coverage-default in_person on OUTSIDE still defaults Zoom.
 */
function resolveMeetingModalityForLocation(facts = {}) {
  const coverage = evaluateCoverage({
    city: facts.city,
    state: facts.state
  });
  const outside = coverage.coverage === "OUTSIDE";
  const source = facts.meetingPreferenceSource || null;
  const prior = facts.preferredMeetingType || null;
  const prospectZoom =
    prior === "zoom" && (source === "prospect" || source === "prospect_confirmed");

  if (outside) {
    if (source === "prospect_confirmed" && prior === "in_person") {
      return {
        coverage: "OUTSIDE",
        meetingType: "in_person",
        meetingPreferenceSource: "prospect_confirmed",
        clearedStaleOffice: false
      };
    }
    if (prospectZoom) {
      return {
        coverage: "OUTSIDE",
        meetingType: "zoom",
        meetingPreferenceSource: "prospect",
        clearedStaleOffice: true
      };
    }
    return {
      coverage: "OUTSIDE",
      meetingType: "zoom",
      meetingPreferenceSource: "coverage_default",
      clearedStaleOffice:
        prior === "in_person" ||
        source === "prospect_requested" ||
        facts.coverage === "LOCAL"
    };
  }

  if (coverage.coverage === "LOCAL") {
    if (prospectZoom) {
      return {
        coverage: "LOCAL",
        meetingType: "zoom",
        meetingPreferenceSource: "prospect",
        clearedStaleOffice: false
      };
    }
    return {
      coverage: "LOCAL",
      meetingType: "in_person",
      meetingPreferenceSource:
        source === "prospect" || source === "prospect_confirmed"
          ? source
          : "coverage_default",
      clearedStaleOffice: false
    };
  }

  return {
    coverage: coverage.coverage || null,
    meetingType: prior || null,
    meetingPreferenceSource: source,
    clearedStaleOffice: false
  };
}

function resolvePendingResume(context) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  if (lastQ === "clarify_license_type") {
    return {
      templateKey: "clarify_license_type",
      lastQuestionAsked: "clarify_license_type"
    };
  }
  if (lastQ === "ask_authorization") {
    return {
      templateKey: "continue_qualification_after_location",
      lastQuestionAsked: "ask_authorization"
    };
  }
  if (lastQ === "ask_day_part" || lastQ === "confirm_slot") {
    return {
      templateKey: "ask_day_part_simple",
      lastQuestionAsked: lastQ
    };
  }
  return resolveQualificationResume(context);
}

function buildFaqResumeDecision(structured, context, intent, templateKey) {
  const resume = resolvePendingResume(context);
  structured.decision.shouldEscalate = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = templateKey;
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    resumeTemplateKey: resume.templateKey,
    city: context.knownFacts?.city || null,
    proposedState: context.knownFacts?.proposedState || null,
    state: context.knownFacts?.state || null
  };
  structured.reasonCodes.push(REASON_CODES.DIRECT_QUESTION_ANSWERED);
  structured.reasonCodes.push(REASON_CODES.SPECIFIC_FAQ_ANSWERED);
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
  structured.contextPatch = {
    currentStage: context.currentStage || STAGES.QUALIFICATION,
    conversation: {
      clarificationCount: 0,
      pendingClarification:
        resume.lastQuestionAsked === "clarify_license_type"
          ? "clarify_license_type"
          : null,
      lastQuestionAsked: resume.lastQuestionAsked,
      lastProspectIntent: intent
    }
  };
  return structured;
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
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_BRIEF_VALUE_PROP_THEN_QUALIFY;
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "value_prop_then_qualify"
    );
  }

  if (intent === INTENTS.INSURANCE_QUESTION) {
    structured.decision.nextAction = NEXT_ACTIONS.ANSWER_INSURANCE_FAQ_THEN_RESUME;
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "insurance_faq_then_resume"
    );
  }

  if (intent === INTENTS.LICENSE_REQUIREMENT_QUESTION) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_LICENSE_REQUIREMENT_THEN_RESUME;
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "license_requirement_faq_then_resume"
    );
  }

  if (intent === INTENTS.COMPENSATION_QUESTION) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_COMPENSATION_FAQ_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.NO_INCOME_GUARANTEE);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "compensation_faq_then_resume"
    );
  }

  if (
    intent === INTENTS.AMBIGUOUS_LICENSE_STATEMENT ||
    (intent === INTENTS.PROVIDE_LICENSE_CLARIFICATION &&
      interpretation.entities?.ambiguousLicense)
  ) {
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_LICENSE_TYPE;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "clarify_license_type";
    structured.reasonCodes.push(REASON_CODES.WORK_AUTH_LICENSE_SEPARATED);
    structured.reasonCodes.push(REASON_CODES.GENERIC_LICENSE_AMBIGUOUS);
    structured.contextPatch = {
      knownFacts: {
        financialLicenseStatus: FINANCIAL_LICENSE_STATUS.UNCLEAR,
        // Never mark work authorization from a generic license statement.
        workAuthorization: context.knownFacts?.workAuthorization ?? null,
        workAuthorizationStatus:
          context.knownFacts?.workAuthorizationStatus || WORK_AUTHORIZATION.UNKNOWN
      },
      conversation: {
        clarificationCount: 0,
        pendingClarification: "clarify_license_type",
        lastQuestionAsked: "clarify_license_type",
        lastProspectIntent: intent
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_LICENSE_CLARIFICATION) {
    const status =
      interpretation.entities?.financialLicenseStatus ||
      FINANCIAL_LICENSE_STATUS.UNKNOWN;
    const types = interpretation.entities?.financialLicenseTypes || [];
    const workAuthUnresolved =
      context.knownFacts?.workAuthorization == null &&
      context.knownFacts?.workAuthorizationStatus !==
        WORK_AUTHORIZATION.AUTHORIZED;

    structured.decision.shouldEscalate = false;
    structured.reasonCodes.push(REASON_CODES.WORK_AUTH_LICENSE_SEPARATED);
    structured.customerReplyPlan.acknowledgeRequest = true;

    if (workAuthUnresolved) {
      structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_WORK_AUTH_AFTER_LICENSE;
      structured.customerReplyPlan.templateKey = "clarify_work_auth_after_license";
      structured.contextPatch = {
        knownFacts: {
          financialLicenseStatus: status,
          financialLicenseTypes: types,
          workAuthorization: null,
          workAuthorizationStatus: WORK_AUTHORIZATION.UNKNOWN
        },
        conversation: {
          clarificationCount: 0,
          pendingClarification: null,
          lastQuestionAsked: "ask_authorization",
          lastProspectIntent: intent
        }
      };
      return structured;
    }

    const resume = resolveQualificationResume({
      ...context,
      knownFacts: {
        ...context.knownFacts,
        financialLicenseStatus: status,
        financialLicenseTypes: types
      }
    });
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = resume.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      city: context.knownFacts?.city || null
    };
    structured.contextPatch = {
      knownFacts: {
        financialLicenseStatus: status,
        financialLicenseTypes: types
      },
      conversation: {
        lastQuestionAsked: resume.lastQuestionAsked,
        lastProspectIntent: intent
      }
    };
    return structured;
  }

  if (intent === INTENTS.REQUEST_LANGUAGE_SWITCH) {
    const requested =
      interpretation.entities?.requestedLanguage || interpretation.preferredLanguage;
    structured.decision.nextAction = NEXT_ACTIONS.SWITCH_LANGUAGE_CONTINUE;
    structured.customerReplyPlan.acknowledgeRequest = true;
    const resume = resolveQualificationResume({
      ...context,
      preferredLanguage: requested
    });
    structured.customerReplyPlan.templateKey = "language_switch_resume";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      resumeTemplateKey: resume.templateKey,
      city: context.knownFacts?.city || null,
      proposedState: context.knownFacts?.proposedState || null
    };
    structured.reasonCodes.push(REASON_CODES.LANGUAGE_EXPLICIT_SWITCH);
    structured.contextPatch = {
      preferredLanguage: requested,
      languageMeta: {
        source: "explicit",
        lastMessageLanguage: requested
      },
      conversation: {
        lastQuestionAsked: resume.lastQuestionAsked,
        lastProspectIntent: INTENTS.REQUEST_LANGUAGE_SWITCH
      }
    };
    return structured;
  }

  if (intent === INTENTS.ECHO_OR_NOOP) {
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
    structured.customerReplyPlan.templateKey = "clarify_once";
    structured.reasonCodes.push(REASON_CODES.ECHO_DETECTED);
    return structured;
  }

  if (intent === INTENTS.CORRECT_LOCATION) {
    const city = interpretation.entities?.city || null;
    const state = interpretation.entities?.state || null;
    const proposedState = interpretation.entities?.proposedState || null;
    const complete =
      interpretation.entities?.completeness === "complete" && city && state;
    const pendingBefore = context.conversation?.lastQuestionAsked || "ask_authorization";

    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_CORRECTION_THEN_RESUME;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.FACT_CORRECTION);
    structured.reasonCodes.push(REASON_CODES.PENDING_QUESTION_DEFERRED);

    if (complete) {
      const modality = resolveMeetingModalityForLocation({
        ...context.knownFacts,
        city,
        state
      });
      const nextFacts = {
        ...context.knownFacts,
        city,
        state,
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        proposedState: null,
        coverage: modality.coverage,
        preferredMeetingType: modality.meetingType,
        meetingPreferenceSource: modality.meetingPreferenceSource
      };
      const resumeKey =
        pendingBefore === "ask_authorization" ||
        context.knownFacts?.workAuthorization == null
          ? "continue_qualification_after_location"
          : resolveQualificationResume({
              ...context,
              knownFacts: {
                ...nextFacts,
                workAuthorization: context.knownFacts?.workAuthorization
              }
            }).templateKey;
      structured.customerReplyPlan.templateKey = "acknowledge_location_correction";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        city,
        state,
        proposedState: state,
        resumeTemplateKey: resumeKey,
        coverage: modality.coverage
      };
      structured.reasonCodes.push(REASON_CODES.LOCATION_COVERAGE_REEVALUATED);
      if (modality.clearedStaleOffice) {
        structured.reasonCodes.push(REASON_CODES.OUTSIDE_CLEARS_STALE_OFFICE);
      }
      if (modality.coverage === "OUTSIDE") {
        structured.reasonCodes.push(REASON_CODES.OUTSIDE_COVERAGE_ZOOM_DEFAULT);
      }
      structured.contextPatch = {
        currentStage: STAGES.QUALIFICATION,
        knownFacts: {
          city,
          state,
          cityCertainty: "confirmed",
          stateCertainty: "confirmed",
          proposedState: null,
          coverage: modality.coverage,
          preferredMeetingType: modality.meetingType,
          meetingPreferenceSource: modality.meetingPreferenceSource
        },
        appointment: {
          meetingType: modality.meetingType
        },
        conversation: {
          clarificationCount: 0,
          pendingClarification: null,
          lastQuestionAsked:
            resumeKey === "continue_qualification_after_location"
              ? "ask_authorization"
              : resolveQualificationResume({
                  knownFacts: {
                    ...nextFacts,
                    workAuthorization: context.knownFacts?.workAuthorization
                  }
                }).lastQuestionAsked,
          lastProspectIntent: INTENTS.CORRECT_LOCATION,
          confirmedFields: Array.from(
            new Set([...(context.conversation?.confirmedFields || []), "city", "state"])
          )
        }
      };
      return structured;
    }

    // Partial correction — propose state, do not keep stale city.
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_LOCATION;
    structured.customerReplyPlan.templateKey = proposedState
      ? "acknowledge_correction_confirm_location"
      : "acknowledge_correction_ask_state";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      city,
      proposedState
    };
    structured.contextPatch = {
      currentStage: STAGES.QUALIFICATION,
      knownFacts: {
        city,
        state: null,
        cityCertainty: "partial",
        stateCertainty: proposedState ? "proposed" : "unknown",
        proposedState: proposedState || null
      },
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastQuestionAsked: proposedState ? "confirm_location" : "ask_state",
        lastProspectIntent: INTENTS.CORRECT_LOCATION
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_AUTHORIZATION) {
    const authorized = interpretation.entities?.workAuthorization;
    structured.decision.shouldEscalate = false;
    structured.reasonCodes.push(REASON_CODES.AUTHORIZATION_CAPTURED);
    structured.reasonCodes.push(REASON_CODES.WORK_AUTH_LICENSE_SEPARATED);

    if (authorized === false) {
      structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
      structured.customerReplyPlan.templateKey = "authorization_denied";
      structured.contextPatch = {
        knownFacts: {
          workAuthorization: false,
          workAuthorizationStatus: WORK_AUTHORIZATION.NOT_AUTHORIZED
        },
        conversation: {
          clarificationCount: 0,
          pendingClarification: null,
          lastQuestionAsked: null,
          lastProspectIntent: INTENTS.PROVIDE_AUTHORIZATION,
          confirmedFields: Array.from(
            new Set([
              ...(context.conversation?.confirmedFields || []),
              "workAuthorization"
            ])
          )
        }
      };
      return structured;
    }

    // If license type was still being clarified, keep that pending after capturing auth.
    const licenseStillUnclear =
      String(context.conversation?.lastQuestionAsked || "") ===
        "clarify_license_type" ||
      context.knownFacts?.financialLicenseStatus ===
        FINANCIAL_LICENSE_STATUS.UNCLEAR;
    if (
      licenseStillUnclear &&
      context.knownFacts?.financialLicenseStatus !==
        FINANCIAL_LICENSE_STATUS.NONE &&
      context.knownFacts?.financialLicenseStatus !==
        FINANCIAL_LICENSE_STATUS.LICENSED &&
      context.knownFacts?.financialLicenseStatus !==
        FINANCIAL_LICENSE_STATUS.IN_PROGRESS
    ) {
      structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_LICENSE_TYPE;
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey = "clarify_license_type";
      structured.contextPatch = {
        knownFacts: {
          workAuthorization: true,
          workAuthorizationStatus: WORK_AUTHORIZATION.AUTHORIZED
        },
        conversation: {
          clarificationCount: 0,
          pendingClarification: "clarify_license_type",
          lastQuestionAsked: "clarify_license_type",
          lastProspectIntent: INTENTS.PROVIDE_AUTHORIZATION,
          confirmedFields: Array.from(
            new Set([
              ...(context.conversation?.confirmedFields || []),
              "workAuthorization"
            ])
          )
        }
      };
      return structured;
    }

    const modality = resolveMeetingModalityForLocation(context.knownFacts || {});
    const outside = modality.coverage === "OUTSIDE";
    const templateKey =
      outside || modality.meetingType === "zoom"
        ? "outside_zoom_day_part"
        : "continue_qualification_after_authorization";

    structured.decision.nextAction = NEXT_ACTIONS.CAPTURE_AUTHORIZATION_CONTINUE;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      city: context.knownFacts?.city || null,
      coverage: modality.coverage
    };
    structured.reasonCodes.push(REASON_CODES.LOCATION_COVERAGE_REEVALUATED);
    structured.reasonCodes.push(
      outside
        ? REASON_CODES.OUTSIDE_COVERAGE_ZOOM_DEFAULT
        : REASON_CODES.LOCAL_COVERAGE_OFFICE_DEFAULT
    );
    if (modality.clearedStaleOffice) {
      structured.reasonCodes.push(REASON_CODES.OUTSIDE_CLEARS_STALE_OFFICE);
    }
    structured.contextPatch = {
      currentStage: STAGES.QUALIFICATION,
      knownFacts: {
        workAuthorization: true,
        workAuthorizationStatus: WORK_AUTHORIZATION.AUTHORIZED,
        coverage: modality.coverage,
        preferredMeetingType: modality.meetingType,
        meetingPreferenceSource: modality.meetingPreferenceSource
      },
      appointment: {
        meetingType: modality.meetingType
      },
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastQuestionAsked: "ask_day_part",
        lastProspectIntent: INTENTS.PROVIDE_AUTHORIZATION,
        confirmedFields: Array.from(
          new Set([
            ...(context.conversation?.confirmedFields || []),
            "workAuthorization"
          ])
        )
      }
    };
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
    const workAuth = String(context.knownFacts?.workAuthorizationStatus || "").toLowerCase();
    const workAuthResolved =
      workAuth === "authorized" || workAuth === "not_authorized";
    const resume = resolvePendingResume(context);
    const coverageFact = String(context.knownFacts?.coverage || "").toUpperCase();
    const hasLocation = Boolean(
      context.knownFacts?.city && context.knownFacts?.state
    );
    const coverageEval = hasLocation
      ? evaluateCoverage({
          city: context.knownFacts.city,
          state: context.knownFacts.state
        })
      : null;
    // Only require travel confirm when coverage is known OUTSIDE (not unknown location).
    const outsideCoverage =
      coverageFact === "OUTSIDE" ||
      (hasLocation && coverageEval?.coverage === "OUTSIDE");

    // BR-085 — OUTSIDE/remote prospect requesting in-person must confirm Doral travel.
    if (meetingType === "in_person" && outsideCoverage) {
      structured.decision.nextAction = NEXT_ACTIONS.CONFIRM_IN_PERSON_TRAVEL;
      structured.decision.mayCreateAppointment = false;
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey = "confirm_in_person_travel_doral";
      structured.reasonCodes.push(
        REASON_CODES.IN_PERSON_TRAVEL_CONFIRMATION_REQUIRED
      );
      structured.contextPatch = {
        knownFacts: {
          meetingTypeRequested: "in_person",
          meetingTypeConfirmed: false,
          // Keep active Zoom/OUTSIDE modality until travel confirmed.
          preferredMeetingType: context.knownFacts?.preferredMeetingType || "zoom",
          meetingPreferenceSource: "prospect_requested"
        },
        appointment: {
          meetingType: context.appointment?.meetingType || "zoom"
        },
        conversation: {
          lastProspectIntent: INTENTS.PROVIDE_MEETING_PREFERENCE,
          lastQuestionAsked: "confirm_in_person_travel",
          pendingClarification: "confirm_in_person_travel"
        }
      };
      return structured;
    }

    if (meetingType === "zoom") {
      structured.reasonCodes.push(REASON_CODES.EXPLICIT_ZOOM_CLEARS_OFFICE);
    }

    const nextQuestion = workAuthResolved
      ? "ask_day_part"
      : resume.lastQuestionAsked || "ask_authorization";
    const templateKey = !workAuthResolved
      ? meetingType === "zoom"
        ? "meeting_preference_zoom_then_auth"
        : "meeting_preference_in_person_then_auth"
      : meetingType === "zoom"
        ? "meeting_preference_zoom"
        : "meeting_preference_in_person";
    structured.decision.nextAction = NEXT_ACTIONS.UPDATE_MEETING_PREFERENCE;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      resumeTemplateKey: resume.templateKey,
      preferredMeetingType: meetingType,
      meetingType,
      coverage: context.knownFacts?.coverage || null
    };
    structured.contextPatch = {
      knownFacts: {
        preferredMeetingType: meetingType,
        meetingPreferenceSource: "prospect",
        meetingTypeRequested: meetingType,
        meetingTypeConfirmed: true
      },
      appointment: {
        meetingType,
        location: meetingType === "zoom" ? null : context.appointment?.location
      },
      conversation: {
        lastProspectIntent: INTENTS.PROVIDE_MEETING_PREFERENCE,
        lastQuestionAsked: nextQuestion,
        pendingClarification:
          nextQuestion === "clarify_license_type" ? "clarify_license_type" : null
      }
    };
    return structured;
  }

  if (intent === INTENTS.CONFIRM_IN_PERSON_TRAVEL) {
    const workAuth = String(context.knownFacts?.workAuthorizationStatus || "").toLowerCase();
    const workAuthResolved =
      workAuth === "authorized" || workAuth === "not_authorized";
    structured.decision.nextAction = NEXT_ACTIONS.UPDATE_MEETING_PREFERENCE;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = workAuthResolved
      ? "meeting_preference_in_person"
      : "meeting_preference_in_person_then_auth";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      preferredMeetingType: "in_person",
      meetingType: "in_person",
      coverage: context.knownFacts?.coverage || null
    };
    structured.reasonCodes.push(REASON_CODES.IN_PERSON_TRAVEL_CONFIRMED);
    structured.contextPatch = {
      knownFacts: {
        preferredMeetingType: "in_person",
        meetingPreferenceSource: "prospect_confirmed",
        meetingTypeRequested: "in_person",
        meetingTypeConfirmed: true
      },
      appointment: {
        meetingType: "in_person",
        location: "Doral office"
      },
      conversation: {
        lastProspectIntent: INTENTS.CONFIRM_IN_PERSON_TRAVEL,
        lastQuestionAsked: workAuthResolved ? "ask_day_part" : "ask_authorization",
        pendingClarification: null
      }
    };
    return structured;
  }

  if (intent === INTENTS.CANCEL_REQUEST) {
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_CANCEL_NO_WRITE;
    structured.decision.mayCreateAppointment = false;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "acknowledge_cancel_no_write";
    structured.reasonCodes.push(REASON_CODES.CANCEL_INTENT_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_STOPPED);
    structured.contextPatch = {
      currentStage: STAGES.WITHDRAWN,
      appointment: {
        status: APPOINTMENT_STATUS.NONE
      },
      conversation: {
        lastProspectIntent: INTENTS.CANCEL_REQUEST,
        lastQuestionAsked: null,
        pendingClarification: null
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.WITHDRAW_INTEREST) {
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_WITHDRAW_NO_WRITE;
    structured.decision.mayCreateAppointment = false;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "acknowledge_withdraw_no_write";
    structured.reasonCodes.push(REASON_CODES.WITHDRAW_INTENT_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_STOPPED);
    structured.contextPatch = {
      currentStage: STAGES.WITHDRAWN,
      appointment: {
        status: APPOINTMENT_STATUS.NONE
      },
      conversation: {
        lastProspectIntent: INTENTS.WITHDRAW_INTEREST,
        lastQuestionAsked: null,
        pendingClarification: null
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.OPT_OUT_REQUEST) {
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_OPT_OUT_NO_WRITE;
    structured.decision.mayCreateAppointment = false;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "acknowledge_opt_out_no_write";
    // No follow-up question / no scheduling resume (BR-086).
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requiresHuman: false,
      stopContact: true
    };
    structured.reasonCodes.push(REASON_CODES.OPT_OUT_INTENT_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.NATURAL_LANGUAGE_OPT_OUT);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_STOPPED);
    if (
      interpretation.entities?.alsoCancelAppointment ||
      interpretation.entities?.cancellationKind === "cancel_and_opt_out"
    ) {
      structured.reasonCodes.push(REASON_CODES.CANCEL_INTENT_RECOGNIZED);
    }
    structured.contextPatch = {
      currentStage: STAGES.WITHDRAWN,
      appointment: interpretation.entities?.alsoCancelAppointment
        ? { status: APPOINTMENT_STATUS.NONE }
        : undefined,
      conversation: {
        lastProspectIntent: INTENTS.OPT_OUT_REQUEST,
        lastQuestionAsked: null,
        pendingClarification: null,
        lastOfferMade: null
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.SCHEDULING_DATE_PROPOSAL) {
    const resolvedDate = interpretation.entities?.resolvedDate || null;
    const priorTime =
      interpretation.entities?.priorProposedTime ||
      context.appointment?.proposedTime ||
      null;
    const priorDate = context.appointment?.proposedDate || null;
    const dateHistory = Array.isArray(context.appointment?.proposedDateHistory)
      ? [...context.appointment.proposedDateHistory]
      : [];
    if (priorDate && resolvedDate?.isoDate && priorDate !== resolvedDate.isoDate) {
      dateHistory.push(priorDate);
      structured.reasonCodes.push(REASON_CODES.DATE_CANDIDATE_REPLACED);
    }
    const exclusions = interpretation.entities?.dateExclusions || [];
    if (exclusions.length) {
      structured.reasonCodes.push(REASON_CODES.DATE_EXCLUSIONS_CAPTURED);
    }
    structured.reasonCodes.push(REASON_CODES.DATE_ONLY_PROPOSAL);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;

    const language = structured.preferredLanguage;
    const dateLabel = formatDateLabel(resolvedDate, language);
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requestedDate: resolvedDate?.isoDate || null,
      dateLabel,
      requestedTime: priorTime
    };

    if (priorTime) {
      structured.decision.nextAction = NEXT_ACTIONS.CONFIRM_DATE_WITH_TIME;
      structured.customerReplyPlan.templateKey = "confirm_date_with_time";
      structured.reasonCodes.push(REASON_CODES.PRIOR_TIME_PRESERVED_WITH_DATE);
      structured.contextPatch = {
        currentStage: STAGES.SCHEDULING,
        knownFacts: {
          dateExclusions: exclusions.length
            ? exclusions
            : context.knownFacts?.dateExclusions || []
        },
        appointment: {
          status: APPOINTMENT_STATUS.PROPOSED,
          proposedDate: resolvedDate?.isoDate || null,
          proposedDateLabel: dateLabel,
          proposedDateHistory: dateHistory,
          proposedTime: priorTime
        },
        conversation: {
          clarificationCount: 0,
          lastProspectIntent: INTENTS.SCHEDULING_DATE_PROPOSAL,
          lastQuestionAsked: "confirm_slot",
          pendingClarification: null
        },
        attention: { needsHumanAttention: false, reason: null }
      };
      return structured;
    }

    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_DATE_ASK_TIME;
    structured.customerReplyPlan.templateKey = "acknowledge_date_ask_time";
    structured.contextPatch = {
      currentStage: STAGES.SCHEDULING,
      knownFacts: {
        dateExclusions: exclusions.length
          ? exclusions
          : context.knownFacts?.dateExclusions || []
      },
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: resolvedDate?.isoDate || null,
        proposedDateLabel: dateLabel,
        proposedDateHistory: dateHistory
      },
      conversation: {
        clarificationCount: 0,
        lastProspectIntent: INTENTS.SCHEDULING_DATE_PROPOSAL,
        lastQuestionAsked: "ask_time_preference",
        pendingClarification: null
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT) {
    const constraint = interpretation.entities?.availabilityConstraint || null;
    const pendingQ = String(context.conversation?.lastQuestionAsked || "");
    structured.decision.nextAction =
      NEXT_ACTIONS.ACKNOWLEDGE_AVAILABILITY_CONSTRAINT;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey =
      "acknowledge_availability_constraint";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      earliestTime: constraint?.earliestTime || null,
      dayPart: constraint?.dayPart || null
    };
    structured.reasonCodes.push(REASON_CODES.AVAILABILITY_CONSTRAINT_CAPTURED);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    structured.contextPatch = {
      knownFacts: {
        availabilityConstraint: constraint,
        preferredDayPart:
          constraint?.dayPart || context.knownFacts?.preferredDayPart || null
      },
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastProspectIntent: INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT,
        // Keep day-part pending if that was the open question; otherwise ask for a time.
        lastQuestionAsked:
          pendingQ === "ask_day_part" ? "ask_day_part" : "ask_time_preference"
      },
      currentStage:
        context.currentStage === STAGES.GREETING
          ? STAGES.QUALIFICATION
          : context.currentStage || STAGES.SCHEDULING
    };
    return structured;
  }

  if (intent === INTENTS.CLARIFY_AM_PM) {
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_AM_PM;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.templateKey = "clarify_am_pm";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ambiguousHour: interpretation.entities?.ambiguousHour || null
    };
    structured.reasonCodes.push(REASON_CODES.AMPM_CLARIFICATION_REQUIRED);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    structured.contextPatch = {
      conversation: {
        clarificationCount: 0,
        pendingClarification: "clarify_am_pm",
        lastQuestionAsked: "clarify_am_pm",
        lastProspectIntent: INTENTS.CLARIFY_AM_PM
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
        lastQuestionAsked: "ask_time_preference",
        lastProspectIntent: INTENTS.PROVIDE_DAY_PART
      },
      knownFacts: {
        preferredDayPart: interpretation.entities?.dayPart || null
      },
      currentStage: STAGES.SCHEDULING
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
    const pendingQ = String(context.conversation?.lastQuestionAsked || "");
    const dayPartPending = pendingQ === "ask_day_part";
    const qualificationPending =
      pendingQ === "ask_authorization" ||
      pendingQ === "clarify_license_type" ||
      pendingQ === "ask_location" ||
      pendingQ === "confirm_location" ||
      pendingQ === "ask_state" ||
      (context.knownFacts?.workAuthorization == null &&
        context.currentStage === STAGES.QUALIFICATION &&
        !dayPartPending &&
        pendingQ !== "ask_time_preference" &&
        pendingQ !== "confirm_slot");

    // Soft path only while work-auth/location still unresolved (not day-part).
    if (qualificationPending) {
      const resume = resolvePendingResume(context);
      structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
      structured.decision.shouldEscalate = false;
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey =
        "acknowledge_availability_then_resume";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        resumeTemplateKey: resume.templateKey,
        city: context.knownFacts?.city || null,
        proposedState: context.knownFacts?.proposedState || null,
        state: context.knownFacts?.state || null,
        requestedTime
      };
      structured.reasonCodes.push(REASON_CODES.DIRECT_QUESTION_ANSWERED);
      structured.contextPatch = {
        conversation: {
          lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
          lastQuestionAsked: resume.lastQuestionAsked,
          pendingClarification:
            resume.lastQuestionAsked === "clarify_license_type"
              ? "clarify_license_type"
              : null
        }
      };
      return structured;
    }

    const priorCandidate = context.appointment?.proposedTime || null;
    const history = Array.isArray(context.appointment?.proposedTimeHistory)
      ? [...context.appointment.proposedTimeHistory]
      : [];
    if (priorCandidate && priorCandidate !== requestedTime) {
      history.push(priorCandidate);
      structured.reasonCodes.push(REASON_CODES.CANDIDATE_TIME_REPLACED);
    }
    if (dayPartPending) {
      structured.reasonCodes.push(REASON_CODES.DIRECT_TIME_OVERRIDES_DAY_PART);
    }

    const inOffered = isTimeInOfferedSlots(requestedTime, offered);
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.COUNTEROFFER_DETECTED);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;

    const unavailable =
      availability?.checked && availability.requestedSlotAvailable === false;
    const sameMenuRejected =
      unavailable &&
      Array.isArray(availability.nearestAlternatives) &&
      slotsEqual(availability.nearestAlternatives, offered);

    if (!inOffered && offered.length > 0 && !priorCandidate) {
      // First counteroffer outside menu — note once; do not treat replacements as mismatches.
      mismatchCount += 1;
      structured.reasonCodes.push(REASON_CODES.COUNTEROFFER_OUTSIDE_OFFERED_SET);
    } else if (!inOffered && offered.length > 0 && priorCandidate === requestedTime) {
      // Repeating the same unavailable candidate can bump once.
      mismatchCount += 1;
      structured.reasonCodes.push(REASON_CODES.COUNTEROFFER_OUTSIDE_OFFERED_SET);
    }

    if (sameMenuRejected) {
      structured.reasonCodes.push(REASON_CODES.SAME_SLOTS_ALREADY_REJECTED);
      structured.reasonCodes.push(REASON_CODES.SLOT_UNAVAILABLE_OFFER_ALTERNATIVES);
      structured.decision.nextAction = NEXT_ACTIONS.OFFER_ALTERNATIVES_NO_HANDOFF;
      structured.customerReplyPlan.templateKey = "offer_alternatives_no_handoff";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        requestedTime,
        alternatives: availability.nearestAlternatives || []
      };
      structured.contextPatch = {
        currentStage: STAGES.SCHEDULING,
        appointment: {
          status: APPOINTMENT_STATUS.PROPOSED,
          proposedTime: requestedTime,
          proposedTimeHistory: history
        },
        conversation: {
          counterofferMismatchCount: mismatchCount,
          clarificationCount: 0,
          lastCounterofferTime: requestedTime,
          lastQuestionAsked: "offer_time_choices",
          lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
          pendingClarification: null
        },
        attention: {
          needsHumanAttention: false,
          reason: null
        }
      };
      return structured;
    }

    if (unavailable) {
      structured.reasonCodes.push(REASON_CODES.SLOT_UNAVAILABLE_OFFER_ALTERNATIVES);
      structured.decision.nextAction = NEXT_ACTIONS.OFFER_ALTERNATIVES_NO_HANDOFF;
      structured.customerReplyPlan.templateKey = "offer_alternatives_no_handoff";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        requestedTime,
        alternatives: availability.nearestAlternatives || []
      };
      structured.contextPatch = {
        currentStage: STAGES.SCHEDULING,
        appointment: {
          status: APPOINTMENT_STATUS.PROPOSED,
          proposedTime: requestedTime,
          proposedTimeHistory: history
        },
        conversation: {
          counterofferMismatchCount: Math.min(mismatchCount, 1),
          clarificationCount: 0,
          lastCounterofferTime: requestedTime,
          lastQuestionAsked: "offer_time_choices",
          lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER
        },
        attention: { needsHumanAttention: false, reason: null }
      };
      return structured;
    }

    // Provider hard failure may escalate — ordinary negotiation never does (BR-084).
    if (availability?.providerFailure === true) {
      structured.decision.nextAction = NEXT_ACTIONS.OFFER_ALTERNATIVES_OR_ESCALATE;
      structured.decision.shouldEscalate = true;
      structured.customerReplyPlan.templateKey = "escalate_after_counteroffer_mismatch";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        requiresHuman: true
      };
      structured.reasonCodes.push(REASON_CODES.ESCALATE_AFTER_REPEATED_MISMATCH);
      structured.contextPatch = {
        attention: {
          needsHumanAttention: true,
          reason: "provider_availability_failure"
        },
        currentStage: STAGES.HUMAN_REQUIRED,
        conversation: {
          counterofferMismatchCount: mismatchCount,
          lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER
        }
      };
      return structured;
    }

    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_AND_CHECK_AVAILABILITY;
    structured.customerReplyPlan.templateKey =
      "acknowledge_counteroffer_check_availability";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requestedTime
    };
    structured.contextPatch = {
      currentStage: STAGES.SCHEDULING,
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedTime: requestedTime,
        proposedTimeHistory: history
      },
      conversation: {
        counterofferMismatchCount:
          priorCandidate && priorCandidate !== requestedTime ? 0 : mismatchCount,
        clarificationCount: 0,
        lastCounterofferTime: requestedTime,
        lastQuestionAsked: "confirm_slot",
        lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
        pendingClarification: null
      },
      attention: { needsHumanAttention: false, reason: null },
      knownFacts: {
        preferredDayPart:
          context.knownFacts?.preferredDayPart ||
          (requestedTime && Number(String(requestedTime).split(":")[0]) >= 12
            ? "afternoon"
            : context.knownFacts?.preferredDayPart)
      }
    };
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
  // Never use human-handoff copy for ordinary mid-flow unknowns on first pass.
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
    structured.decision.shouldEscalate = false;
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
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
  structured.decision.shouldEscalate = false;
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
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
  buildBaseDecision,
  resolveQualificationResume,
  resolveMeetingModalityForLocation
};
