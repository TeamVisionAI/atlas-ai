/**
 * Recruit AI v2 — business decision engine.
 * Produces auditable StructuredDecision JSON. Never executes side effects.
 * Implements BR-081 / BR-082 / BR-083 / BR-084 / BR-085 / BR-086 / BR-087 / BR-088 / BR-089 / BR-090.
 */

const { formatDateLabel } = require("./dateResolution");
const {
  resolvePostModalityScheduling,
  resolveSchedulingQuestionSkip,
  resolveZoomLinkFromContext,
  resolveDateLabel,
  hasAvailabilityConstraint,
  hasProposedTime
} = require("./schedulingMemory");
const {
  resolvePendingExplanation,
  resolveDayPartContinuation
} = require("./conversationContinuity");

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
const {
  hasConfirmableAppointmentProposal
} = require("./schedulingConfirmation");
const {
  isBeforeEarliestConstraint
} = require("./schedulingConstraints");

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

  // BR-087 — do not re-ask day-part when slot/constraint already known.
  // resolveQualificationResume only has knownFacts; callers with full context
  // use resolveSchedulingQuestionSkip separately.
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
  // BR-087 — skip redundant day-part when constraint/slot already known.
  const skip = resolveSchedulingQuestionSkip(context);
  if (skip && (lastQ === "ask_day_part" || lastQ === "confirm_slot" || !lastQ)) {
    if (hasProposedTime(context)) {
      return {
        templateKey: "confirm_date_with_time",
        lastQuestionAsked: "confirm_slot",
        entities: skip.entities
      };
    }
    if (hasAvailabilityConstraint(context)) {
      return {
        templateKey: "ask_time_after_constraint",
        lastQuestionAsked: "ask_time_preference",
        entities: skip.entities
      };
    }
  }
  // BR-088 / BR-105 — resume most-specific pending time ask (never bare Continuemos).
  // Availability constraints outrank day-part-only prompts.
  if (
    lastQ === "ask_time_preference" ||
    lastQ === "ask_time_after_day_part" ||
    lastQ === "ask_time_after_constraint"
  ) {
    if (hasAvailabilityConstraint(context)) {
      return {
        templateKey: "ask_time_after_constraint",
        lastQuestionAsked: "ask_time_preference",
        entities: {
          earliestTime:
            context.knownFacts?.availabilityConstraint?.earliestTime || null,
          dayPart: context.knownFacts?.preferredDayPart || null
        }
      };
    }
    const dayPart = String(context.knownFacts?.preferredDayPart || "").toLowerCase();
    if (dayPart === "morning") {
      return {
        templateKey: "acknowledge_morning_ask_time",
        lastQuestionAsked: "ask_time_preference",
        entities: { dayPart: "morning" }
      };
    }
    if (dayPart === "afternoon" || dayPart === "evening") {
      return {
        templateKey: "acknowledge_afternoon_ask_time",
        lastQuestionAsked: "ask_time_preference",
        entities: { dayPart: dayPart === "evening" ? "evening" : "afternoon" }
      };
    }
    return {
      templateKey: "explain_pending_time",
      lastQuestionAsked: "ask_time_preference",
      entities: {}
    };
  }
  // Implements BR-103 — preference captured; availability not yet presented.
  if (lastQ === "awaiting_availability" && hasProposedTime(context)) {
    return {
      templateKey: "acknowledge_preference_awaiting_availability",
      lastQuestionAsked: "awaiting_availability",
      entities: {
        requestedTime: context.appointment.proposedTime
      }
    };
  }
  if (lastQ === "confirm_slot" && hasProposedTime(context)) {
    return {
      templateKey: "confirm_date_with_time",
      lastQuestionAsked: "confirm_slot",
      entities: {
        requestedTime: context.appointment.proposedTime,
        dateLabel: resolveDateLabel(context, "spanish")
      }
    };
  }
  if (lastQ === "ask_day_part" || lastQ === "confirm_slot") {
    return {
      templateKey: "ask_day_part_simple",
      lastQuestionAsked: "ask_day_part",
      entities: {}
    };
  }
  return resolveQualificationResume(context);
}

function applyPostModalityScheduling(structured, context, meetingType) {
  const language = structured.preferredLanguage || "spanish";
  const resume = resolvePostModalityScheduling(context, language);
  const office =
    meetingType === "in_person" &&
    String(context.knownFacts?.coverage || "").toUpperCase() === "OUTSIDE";

  let templateKey;
  if (resume.templateKeySuffix === "confirm_slot") {
    templateKey =
      meetingType === "zoom"
        ? "meeting_preference_zoom_confirm_slot"
        : office
          ? "meeting_preference_in_person_office_confirm_slot"
          : "meeting_preference_in_person_confirm_slot";
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_MEMORY_PRESERVED);
    structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
  } else if (resume.templateKeySuffix === "ask_time") {
    templateKey =
      meetingType === "zoom"
        ? "meeting_preference_zoom_ask_time"
        : "meeting_preference_in_person_ask_time";
    structured.reasonCodes.push(REASON_CODES.SKIP_REDUNDANT_DAY_PART);
    structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
  } else {
    templateKey =
      meetingType === "zoom"
        ? "meeting_preference_zoom"
        : "meeting_preference_in_person";
  }

  structured.customerReplyPlan.templateKey = templateKey;
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    preferredMeetingType: meetingType,
    meetingType,
    coverage: context.knownFacts?.coverage || null,
    ...resume.entities
  };
  return resume;
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
    state: context.knownFacts?.state || null,
    preferredMeetingType: context.knownFacts?.preferredMeetingType || null,
    meetingType:
      context.knownFacts?.preferredMeetingType ||
      context.appointment?.meetingType ||
      null,
    coverage: context.knownFacts?.coverage || null,
    dayPart: context.knownFacts?.preferredDayPart || null,
    requestedTime: context.appointment?.proposedTime || null,
    dateLabel: resolveDateLabel(
      context,
      structured.preferredLanguage || "spanish"
    ),
    earliestTime:
      context.knownFacts?.availabilityConstraint?.earliestTime || null,
    ...resume.entities
  };
  structured.reasonCodes.push(REASON_CODES.DIRECT_QUESTION_ANSWERED);
  structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_SCHEDULING);
  structured.reasonCodes.push(REASON_CODES.SPECIFIC_FAQ_ANSWERED);
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
  if (
    resume.templateKey === "ask_time_after_constraint" ||
    resume.entities?.earliestTime
  ) {
    structured.reasonCodes.push(REASON_CODES.MOST_SPECIFIC_SCHEDULING_RESUME);
  }
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

  if (
    intent === INTENTS.JOB_OPPORTUNITY_QUESTION ||
    intent === INTENTS.OPPORTUNITY_QUESTION
  ) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_JOB_OPPORTUNITY_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.JOB_OPPORTUNITY_FAQ);
    // Implements BR-097 — progressive disclosure for first-level overview asks.
    const overviewFaq =
      interpretation.entities?.jobFaqDetailLevel === "overview";
    if (overviewFaq) {
      structured.reasonCodes.push(REASON_CODES.JOB_OVERVIEW_FAQ);
      structured.reasonCodes.push(REASON_CODES.JOB_FAQ_PROGRESSIVE_DISCLOSURE);
    } else {
      structured.reasonCodes.push(REASON_CODES.NO_INCOME_GUARANTEE);
    }
    const jobFaq = buildFaqResumeDecision(
      structured,
      context,
      intent,
      overviewFaq
        ? "job_overview_faq_then_resume"
        : "job_opportunity_faq_then_resume"
    );
    jobFaq.customerReplyPlan.entities = {
      ...jobFaq.customerReplyPlan.entities,
      jobFaqDetailLevel: overviewFaq ? "overview" : "employment_framing"
    };
    jobFaq.contextPatch = {
      ...(jobFaq.contextPatch || {}),
      conversation: {
        ...((jobFaq.contextPatch && jobFaq.contextPatch.conversation) || {}),
        opportunityExplained: true
      }
    };
    return jobFaq;
  }

  // BR-090 — fixed-employment preference: acknowledge without forcing scheduling.
  if (intent === INTENTS.FIXED_EMPLOYMENT_PREFERENCE) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ACKNOWLEDGE_FIXED_EMPLOYMENT_PREFERENCE;
    structured.decision.mayCreateAppointment = false;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey =
      "acknowledge_fixed_employment_preference";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requiresHuman: false
    };
    structured.reasonCodes.push(
      REASON_CODES.FIXED_EMPLOYMENT_PREFERENCE_RECOGNIZED
    );
    structured.reasonCodes.push(REASON_CODES.FIXED_EMPLOYMENT_NO_PRESSURE);
    structured.reasonCodes.push(REASON_CODES.NO_INCOME_GUARANTEE);
    structured.reasonCodes.push(REASON_CODES.EMPLOYMENT_FIT_STATE_SEPARATED);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      knownFacts: {
        employmentPreference: "fixed",
        currentFit: context.knownFacts?.currentFit || "exploring"
      },
      conversation: {
        lastProspectIntent: INTENTS.FIXED_EMPLOYMENT_PREFERENCE,
        lastQuestionAsked: null,
        pendingClarification: null,
        fixedEmploymentAcknowledged: true,
        opportunityExplained:
          context.conversation?.opportunityExplained === true
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  // BR-090 — polite terminal closure for clear current non-fit (not opt-out).
  if (intent === INTENTS.CURRENT_NOT_FIT) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ACKNOWLEDGE_CURRENT_NOT_FIT_NO_WRITE;
    structured.decision.mayCreateAppointment = false;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey =
      "acknowledge_current_not_fit_no_write";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requiresHuman: false,
      stopContact: false
    };
    structured.reasonCodes.push(REASON_CODES.CURRENT_NOT_FIT_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.POLITE_CURRENT_NOT_FIT_CLOSURE);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_STOPPED);
    structured.reasonCodes.push(REASON_CODES.EMPLOYMENT_FIT_STATE_SEPARATED);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      currentStage: STAGES.CURRENT_NOT_FIT,
      knownFacts: {
        employmentPreference:
          interpretation.entities?.employmentPreference ||
          context.knownFacts?.employmentPreference ||
          "fixed",
        currentFit: "not_now"
      },
      appointment: {
        status: APPOINTMENT_STATUS.NONE
      },
      conversation: {
        lastProspectIntent: INTENTS.CURRENT_NOT_FIT,
        lastQuestionAsked: null,
        pendingClarification: null,
        lastOfferMade: null,
        fixedEmploymentAcknowledged: true,
        opportunityExplained: true
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.CONVERSATION_CLARIFICATION_REQUEST) {
    const explanation = resolvePendingExplanation(
      context,
      structured.preferredLanguage || "spanish"
    );
    structured.decision.nextAction = NEXT_ACTIONS.EXPLAIN_PENDING_THEN_ASK;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = explanation.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...explanation.entities,
      city: context.knownFacts?.city || null,
      preferredMeetingType: context.knownFacts?.preferredMeetingType || null,
      coverage: context.knownFacts?.coverage || null
    };
    structured.reasonCodes.push(REASON_CODES.META_CONVERSATION_CLARIFIED);
    structured.reasonCodes.push(REASON_CODES.NO_DEAD_END_CONTINUATION);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      conversation: {
        lastProspectIntent: INTENTS.CONVERSATION_CLARIFICATION_REQUEST,
        lastQuestionAsked:
          explanation.lastQuestionAsked ||
          context.conversation?.lastQuestionAsked ||
          null,
        pendingClarification: null,
        clarificationCount: 0
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.INSURANCE_QUESTION) {
    structured.decision.nextAction = NEXT_ACTIONS.ANSWER_INSURANCE_FAQ_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.INSURANCE_FAQ_ROUTED);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "insurance_faq_then_resume"
    );
  }

  if (intent === INTENTS.EXPERIENCE_QUESTION) {
    // Implements BR-098 — concise experience FAQ, then resume pending question.
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_EXPERIENCE_FAQ_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.EXPERIENCE_FAQ);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "experience_faq_then_resume"
    );
  }

  if (intent === INTENTS.SALES_OBJECTION) {
    // Implements BR-099 — sales skill/aversion objection before correction/location.
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_SALES_OBJECTION_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.SALES_OBJECTION_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.SALES_OBJECTION_OUTRANKS_CORRECTION);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    const salesFaq = buildFaqResumeDecision(
      structured,
      context,
      intent,
      "sales_objection_faq_then_resume"
    );
    salesFaq.customerReplyPlan.entities = {
      ...salesFaq.customerReplyPlan.entities,
      salesObjectionKind:
        interpretation.entities?.salesObjectionKind || "skill"
    };
    return salesFaq;
  }

  if (intent === INTENTS.NETWORK_OBJECTION) {
    // Implements BR-103 — network objection; preserve scheduling facts and resume.
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_NETWORK_OBJECTION_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.NETWORK_OBJECTION_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_SCHEDULING);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "network_objection_faq_then_resume"
    );
  }

  if (intent === INTENTS.SOFT_ACKNOWLEDGEMENT) {
    // Implements BR-103 — ok/perfecto while availability pending is not confirmation.
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_SOFT_CONTINUE;
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey =
      "acknowledge_preference_awaiting_availability";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requestedTime: context.appointment?.proposedTime || null,
      dayPart: context.knownFacts?.preferredDayPart || null
    };
    structured.reasonCodes.push(REASON_CODES.SOFT_ACKNOWLEDGEMENT_ONLY);
    structured.reasonCodes.push(REASON_CODES.PREMATURE_SCHEDULE_CONFIRM_BLOCKED);
    structured.reasonCodes.push(REASON_CODES.CONFIRMATION_REQUIRES_CONCRETE_SLOT);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      currentStage: context.currentStage || STAGES.SCHEDULING,
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastProspectIntent: INTENTS.SOFT_ACKNOWLEDGEMENT,
        lastQuestionAsked:
          context.conversation?.lastQuestionAsked === "confirm_slot" &&
          !hasConfirmableAppointmentProposal(context)
            ? "awaiting_availability"
            : context.conversation?.lastQuestionAsked || "awaiting_availability"
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.LICENSE_PATH_DETAIL_QUESTION) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_LICENSE_PATH_DETAIL_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.LICENSE_PATH_DETAIL_ANSWERED);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "license_path_detail_faq_then_resume"
    );
  }

  if (intent === INTENTS.LICENSE_REQUIREMENT_QUESTION) {
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_LICENSE_REQUIREMENT_THEN_RESUME;
    structured.reasonCodes.push(
      REASON_CODES.LICENSE_REQUIREMENT_QUESTION_RECOGNIZED
    );
    // Ordinary requirement FAQ must not volunteer 2-14/2-15 path detail.
    structured.reasonCodes.push(REASON_CODES.LICENSE_PATH_DETAIL_NOT_VOLUNTEERED);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "license_requirement_faq_then_resume"
    );
  }

  if (intent === INTENTS.COMPENSATION_QUESTION) {
    // Implements BR-104 — answer compensation FAQ then resume exact pending ask_time/etc.
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_COMPENSATION_FAQ_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.NO_INCOME_GUARANTEE);
    const detailKind =
      interpretation.entities?.compensationDetailKind || "general";
    const compensationFaq = buildFaqResumeDecision(
      structured,
      context,
      intent,
      "compensation_faq_then_resume"
    );
    compensationFaq.customerReplyPlan.entities = {
      ...compensationFaq.customerReplyPlan.entities,
      compensationDetailKind: detailKind
    };
    compensationFaq.contextPatch = {
      ...(compensationFaq.contextPatch || {}),
      conversation: {
        ...((compensationFaq.contextPatch &&
          compensationFaq.contextPatch.conversation) ||
          {}),
        opportunityExplained: true
      }
    };
    return compensationFaq;
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
    structured.reasonCodes.push(REASON_CODES.LICENSE_AMBIGUITY_RESERVED);
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
    structured.reasonCodes.push(REASON_CODES.LICENSE_STATUS_STATEMENT);
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
    if (interpretation.entities?.puertoRicoOrigin) {
      structured.reasonCodes.push(REASON_CODES.PUERTO_RICO_WORK_AUTH_NORMALIZED);
    }

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

    // Implements BR-102 — state-only partial asks for city in that state.
    if (completeness === "state_only" || (state && !city)) {
      structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_LOCATION;
      structured.reasonCodes.push(REASON_CODES.PARTIAL_LOCATION);
      structured.reasonCodes.push(REASON_CODES.STATE_ONLY_LOCATION);
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey = "ask_city";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        city: null,
        state: state || null,
        proposedState: state || null
      };
      structured.contextPatch = {
        currentStage: STAGES.QUALIFICATION,
        knownFacts: {
          city: null,
          state: state || null,
          cityCertainty: "unknown",
          stateCertainty: "partial",
          proposedState: null
        },
        conversation: {
          ...bumpClarification(context, "ask_city"),
          lastQuestionAsked: "ask_city",
          lastProspectIntent: INTENTS.PROVIDE_LOCATION
        }
      };
      return structured;
    }

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

    structured.decision.nextAction = NEXT_ACTIONS.UPDATE_MEETING_PREFERENCE;
    structured.customerReplyPlan.acknowledgeRequest = true;

    let nextQuestion;
    if (!workAuthResolved) {
      nextQuestion = resume.lastQuestionAsked || "ask_authorization";
      structured.customerReplyPlan.templateKey =
        meetingType === "zoom"
          ? "meeting_preference_zoom_then_auth"
          : "meeting_preference_in_person_then_auth";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        resumeTemplateKey: resume.templateKey,
        preferredMeetingType: meetingType,
        meetingType,
        coverage: context.knownFacts?.coverage || null
      };
    } else {
      // BR-087 — preserve date/time/constraint; confirm slot instead of day-part reset.
      const post = applyPostModalityScheduling(structured, context, meetingType);
      nextQuestion = post.lastQuestionAsked;
    }

    structured.contextPatch = {
      knownFacts: {
        preferredMeetingType: meetingType,
        meetingPreferenceSource: "prospect",
        meetingTypeRequested: meetingType,
        meetingTypeConfirmed: true
        // availabilityConstraint intentionally untouched
      },
      appointment: {
        meetingType,
        location: meetingType === "zoom" ? null : context.appointment?.location
        // proposedDate / proposedTime preserved via merge
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
    structured.reasonCodes.push(REASON_CODES.IN_PERSON_TRAVEL_CONFIRMED);

    let nextQuestion;
    if (!workAuthResolved) {
      nextQuestion = "ask_authorization";
      structured.customerReplyPlan.templateKey =
        "meeting_preference_in_person_then_auth";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        preferredMeetingType: "in_person",
        meetingType: "in_person",
        coverage: context.knownFacts?.coverage || null
      };
    } else {
      const post = applyPostModalityScheduling(structured, context, "in_person");
      nextQuestion = post.lastQuestionAsked;
    }

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
        lastQuestionAsked: nextQuestion,
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
    structured.reasonCodes.push(REASON_CODES.CLEAN_WITHDRAWAL_CLOSURE);
    if (interpretation.entities?.directLackOfInterest) {
      structured.reasonCodes.push(
        REASON_CODES.DIRECT_LACK_OF_INTEREST_RECOGNIZED
      );
    }
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
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
    const dateHint =
      interpretation.entities?.requestedDate ||
      interpretation.scheduleParse?.dayHint ||
      null;
    if (dateHint?.kind === "offset" && Number(dateHint.days) === 1) {
      structured.reasonCodes.push(REASON_CODES.MANANA_DATE_CONTEXT);
    }
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
    const prior = context.knownFacts?.availabilityConstraint || null;
    const repetition =
      Boolean(interpretation.entities?.repetitionSignal) ||
      (prior?.earliestTime &&
        constraint?.earliestTime &&
        prior.earliestTime === constraint.earliestTime);
    structured.decision.nextAction =
      NEXT_ACTIONS.ACKNOWLEDGE_AVAILABILITY_CONSTRAINT;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;

    const proposedTime = context.appointment?.proposedTime || null;
    if (repetition) {
      structured.customerReplyPlan.templateKey = proposedTime
        ? "acknowledge_known_availability_confirm_slot"
        : "acknowledge_known_availability";
      structured.reasonCodes.push(REASON_CODES.REPETITION_ACKNOWLEDGED);
      structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
    } else {
      structured.customerReplyPlan.templateKey =
        "acknowledge_availability_constraint";
      structured.reasonCodes.push(REASON_CODES.AVAILABILITY_CONSTRAINT_CAPTURED);
    }
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    structured.reasonCodes.push(REASON_CODES.SKIP_REDUNDANT_DAY_PART);
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      earliestTime: constraint?.earliestTime || prior?.earliestTime || null,
      dayPart: constraint?.dayPart || prior?.dayPart || null,
      requestedTime: proposedTime,
      dateLabel: resolveDateLabel(
        context,
        structured.preferredLanguage || "spanish"
      )
    };
    structured.contextPatch = {
      knownFacts: {
        availabilityConstraint: constraint || prior,
        // Implements BR-105 — keep confirmed day_part (afternoon) over constraint evening bias.
        preferredDayPart:
          context.knownFacts?.preferredDayPart ||
          constraint?.dayPart ||
          prior?.dayPart ||
          null
      },
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastProspectIntent: INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT,
        // BR-087 — never bounce back to day-part after after-5 is known.
        lastQuestionAsked: proposedTime ? "confirm_slot" : "ask_time_preference"
      },
      currentStage:
        context.currentStage === STAGES.GREETING
          ? STAGES.QUALIFICATION
          : context.currentStage || STAGES.SCHEDULING
    };
    return structured;
  }

  if (intent === INTENTS.REASSERT_KNOWN_FACT) {
    const proposedTime = context.appointment?.proposedTime || null;
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_KNOWN_AVAILABILITY;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = proposedTime
      ? "acknowledge_known_availability_confirm_slot"
      : "acknowledge_known_availability";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      earliestTime:
        context.knownFacts?.availabilityConstraint?.earliestTime || null,
      requestedTime: proposedTime,
      dateLabel: resolveDateLabel(
        context,
        structured.preferredLanguage || "spanish"
      )
    };
    structured.reasonCodes.push(REASON_CODES.REPETITION_ACKNOWLEDGED);
    structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      conversation: {
        lastProspectIntent: INTENTS.REASSERT_KNOWN_FACT,
        lastQuestionAsked: proposedTime ? "confirm_slot" : "ask_time_preference",
        pendingClarification: null,
        clarificationCount: 0
      },
      attention: { needsHumanAttention: false, reason: null }
    };
    return structured;
  }

  if (intent === INTENTS.MEETING_ACCESS_REQUEST) {
    const link = resolveZoomLinkFromContext(context);
    const proposedTime = context.appointment?.proposedTime || null;
    const dateLabel = resolveDateLabel(
      context,
      structured.preferredLanguage || "spanish"
    );
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_MEETING_ACCESS;
    structured.decision.mayCreateAppointment = false;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.MEETING_ACCESS_REQUESTED);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);

    if (!link.confirmed) {
      structured.customerReplyPlan.templateKey = proposedTime
        ? "zoom_link_after_confirm_with_slot"
        : "zoom_link_after_confirm";
      structured.reasonCodes.push(REASON_CODES.ZOOM_LINK_DEFERRED_UNTIL_CONFIRM);
    } else if (link.available) {
      structured.customerReplyPlan.templateKey = "zoom_link_canonical_share";
      structured.reasonCodes.push(REASON_CODES.ZOOM_LINK_CANONICAL_PROPOSED);
    } else {
      structured.customerReplyPlan.templateKey = "zoom_link_pending_unavailable";
      structured.reasonCodes.push(REASON_CODES.ZOOM_LINK_PENDING_UNAVAILABLE);
    }

    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requestedTime: proposedTime,
      dateLabel,
      zoomUrl: link.url || null,
      preferredMeetingType:
        context.knownFacts?.preferredMeetingType ||
        context.appointment?.meetingType ||
        "zoom",
      meetingType:
        context.knownFacts?.preferredMeetingType ||
        context.appointment?.meetingType ||
        "zoom"
    };
    structured.contextPatch = {
      conversation: {
        lastProspectIntent: INTENTS.MEETING_ACCESS_REQUEST,
        lastQuestionAsked: proposedTime
          ? "confirm_slot"
          : context.conversation?.lastQuestionAsked || "ask_time_preference",
        pendingClarification: null
      },
      attention: { needsHumanAttention: false, reason: null }
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
    const dayPart = interpretation.entities?.dayPart || null;
    const cont = resolveDayPartContinuation(
      dayPart,
      structured.preferredLanguage || "spanish"
    );
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_DAY_PART_ASK_TIME;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    // BR-088 — never emit bare "Continuemos"; always ask for time next.
    structured.customerReplyPlan.templateKey = cont.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...cont.entities,
      dayPart
    };
    structured.reasonCodes.push(REASON_CODES.DAY_PART_ADVANCES_TO_TIME);
    structured.reasonCodes.push(REASON_CODES.NO_DEAD_END_CONTINUATION);
    {
      const mananaNorm = String(
        interpretation.entities?.rawText || interpretation.rawText || ""
      )
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[?!¡¿.]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (
        /^(manana|morning|en la manana|por la manana|a la manana|in the morning)$/.test(
          mananaNorm
        )
      ) {
        structured.reasonCodes.push(REASON_CODES.MANANA_DAY_PART_CONTEXT);
        structured.reasonCodes.push(REASON_CODES.DAY_PART_CONTEXT_PRIORITY);
      }
    }
    structured.contextPatch = {
      conversation: {
        clarificationCount: 0,
        pendingClarification: null,
        lastQuestionAsked: cont.lastQuestionAsked,
        lastProspectIntent: INTENTS.PROVIDE_DAY_PART
      },
      knownFacts: {
        preferredDayPart: dayPart
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
      pendingQ === "ask_city" ||
      (context.knownFacts?.workAuthorization == null &&
        context.currentStage === STAGES.QUALIFICATION &&
        !dayPartPending &&
        pendingQ !== "ask_time_preference" &&
        pendingQ !== "confirm_slot");

    // Implements BR-105 — reject times before confirmed earliestTime (e.g. after 5 + 4).
    const earliestBound =
      context.knownFacts?.availabilityConstraint?.earliestTime || null;
    if (
      requestedTime &&
      earliestBound &&
      isBeforeEarliestConstraint(requestedTime, earliestBound)
    ) {
      structured.decision.nextAction =
        NEXT_ACTIONS.ACKNOWLEDGE_AVAILABILITY_CONSTRAINT;
      structured.decision.shouldEscalate = false;
      structured.decision.mayCreateAppointment = false;
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey = "clarify_time_after_constraint";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        earliestTime: earliestBound,
        requestedTime,
        dayPart: context.knownFacts?.preferredDayPart || null
      };
      structured.reasonCodes.push(REASON_CODES.AVAILABILITY_CONSTRAINT_CONFLICT);
      structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
      structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
      structured.contextPatch = {
        conversation: {
          lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
          lastQuestionAsked: "ask_time_preference",
          pendingClarification: null,
          clarificationCount: 0
        },
        knownFacts: {
          availabilityConstraint: context.knownFacts?.availabilityConstraint || null
        },
        attention: { needsHumanAttention: false, reason: null }
      };
      return structured;
    }

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
        // Implements BR-103 — preference noted; options not yet presented.
        lastQuestionAsked: "awaiting_availability",
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
    // Defense in depth — never confirm without a concrete confirmable proposal.
    if (!hasConfirmableAppointmentProposal(context)) {
      structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_SOFT_CONTINUE;
      structured.decision.shouldEscalate = false;
      structured.decision.mayCreateAppointment = false;
      structured.customerReplyPlan.acknowledgeRequest = true;
      structured.customerReplyPlan.templateKey =
        "acknowledge_preference_awaiting_availability";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        requestedTime: context.appointment?.proposedTime || null
      };
      structured.reasonCodes.push(REASON_CODES.PREMATURE_SCHEDULE_CONFIRM_BLOCKED);
      structured.reasonCodes.push(REASON_CODES.CONFIRMATION_REQUIRES_CONCRETE_SLOT);
      structured.reasonCodes.push(REASON_CODES.SOFT_ACKNOWLEDGEMENT_ONLY);
      structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
      structured.contextPatch = {
        conversation: {
          lastQuestionAsked: "awaiting_availability",
          lastProspectIntent: INTENTS.SOFT_ACKNOWLEDGEMENT,
          clarificationCount: 0,
          pendingClarification: null
        },
        attention: { needsHumanAttention: false, reason: null }
      };
      return structured;
    }
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
