/**
 * Recruit AI v2 — business decision engine.
 * Produces auditable StructuredDecision JSON. Never executes side effects.
 * Implements BR-081 / BR-082 / BR-083 / BR-084 / BR-085 / BR-086 / BR-087 / BR-088 / BR-089 / BR-090 / BR-115 / BR-116 / BR-119 / BR-164.
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
  resolveDayPartContinuation,
  hasConcretePriorAtlasQuestion,
  looksLikeSpanishInfoRequest,
  looksLikeEnglishInfoRequest,
  looksLikeJobOverviewQuestion,
  looksLikeJobOpportunityQuestion,
  looksLikeOfficeLocationQuestion,
  looksLikeNearbyLocationPreference,
  looksLikeOfficeHoursQuestion,
  looksLikeAvailableDaysQuestion,
  looksLikeClarifiableNonresponsiveInput
} = require("./conversationContinuity");
const { isBareConversationalYes } = require("../languageLibrary");
const {
  shouldSoftInviteInterview,
  isQualificationCompleteForInterview
} = require("./conversationObjections");

const {
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE,
  MAX_CLARIFICATIONS_BEFORE_ESCALATE
} = require("./constants");
const {
  isTimeInOfferedSlots,
  resolveUniqueOfferedSlotSelection,
  resolveUniqueOfferedDaySelection,
  isOfferedSetAlreadySameDay,
  filterOfferedSlotsByDayPart,
  slotDate,
  slotTime,
  slotsEqual,
  APPOINTMENT_STATUS,
  STAGES
} = require("./conversationContext");
const { evaluateCoverage } = require("../businessRulesEngine");
const { coverageInputFromContext } = require("../recruitingCoverage");
const { extractOfficeCity } = require("../officeAddressResolver");
const {
  WORK_AUTHORIZATION,
  FINANCIAL_LICENSE_STATUS
} = require("./qualificationFacts");
const { shouldBlockLocationOverwrite } = require("./factCertainty");
const {
  resolveFaqResumeTemplateKeyFromFacts,
  factsAheadOfLastQuestion
} = require("../recruitConversationSequencing");
const {
  hasConfirmableAppointmentProposal
} = require("./schedulingConfirmation");
const {
  violatesEarliestConstraint
} = require("./schedulingConstraints");
const { READ_STATUS } = require("./schedulingAvailabilityReader");
const { mergeSchedulingConstraints } = require("../sharedScheduling/schedulingNegotiationState");
const { applyIulAdDecision } = require("./iulAdConversation");
const {
  parseLocationAnswer,
  canonicalizeCityName,
  isStateNameNotCity
} = require("./locationFacts");
const {
  selectedSlotFromContext,
  pickReplacementSlots
} = require("./recruitingConfirmationBookingSafety");

function isPendingOfferedSlotChoice(pendingQ, offeredSlots = []) {
  if (!Array.isArray(offeredSlots) || offeredSlots.length === 0) {
    return false;
  }
  return (
    pendingQ === "offer_time_choices" ||
    pendingQ === "offer_alternatives" ||
    pendingQ === "offer_available_slots"
  );
}

function factResumeFromContext(context) {
  return resolveFaqResumeTemplateKeyFromFacts({
    city: context?.knownFacts?.city,
    state: context?.knownFacts?.state,
    proposedState: context?.knownFacts?.proposedState,
    cityCertainty: context?.knownFacts?.cityCertainty,
    stateCertainty: context?.knownFacts?.stateCertainty,
    workAuthorization: context?.knownFacts?.workAuthorization,
    workAuthorizationStatus: context?.knownFacts?.workAuthorizationStatus,
    preferredDayPart: context?.knownFacts?.preferredDayPart,
    dayPart: context?.knownFacts?.preferredDayPart
  });
}

function looksLikeMissedJobFaq(interpretation) {
  const text = inboundTextFromInterpretation(interpretation);
  return (
    looksLikeSpanishInfoRequest(text) ||
    looksLikeEnglishInfoRequest(text) ||
    looksLikeJobOverviewQuestion(text) ||
    looksLikeJobOpportunityQuestion(text)
  );
}

function applyMissedJobFaq(structured, context, interpretation) {
  if (!looksLikeMissedJobFaq(interpretation)) {
    return false;
  }
  const text = inboundTextFromInterpretation(interpretation);
  const templateKey = looksLikeJobOverviewQuestion(text)
    ? "job_overview_faq_then_resume"
    : "job_opportunity_faq_then_resume";
  buildFaqResumeDecision(
    structured,
    context,
    INTENTS.JOB_OPPORTUNITY_QUESTION,
    templateKey,
    interpretation
  );
  structured.decision.nextAction = NEXT_ACTIONS.ANSWER_JOB_OPPORTUNITY_THEN_RESUME;
  structured.reasonCodes.push(REASON_CODES.JOB_OVERVIEW_FAQ);
  structured.reasonCodes.push(REASON_CODES.FAQ_RESUME_NEXT_UNRESOLVED);
  return true;
}

function applyMissedOfficeLocationFaq(structured, context, interpretation) {
  const text = inboundTextFromInterpretation(interpretation);
  if (
    interpretation?.intent !== INTENTS.OFFICE_LOCATION_QUESTION &&
    !looksLikeOfficeLocationQuestion(text) &&
    !looksLikeNearbyLocationPreference(text)
  ) {
    return false;
  }
  buildFaqResumeDecision(
    structured,
    context,
    INTENTS.OFFICE_LOCATION_QUESTION,
    "office_location_faq_then_resume",
    interpretation
  );
  structured.decision.nextAction = NEXT_ACTIONS.ANSWER_OFFICE_LOCATION_THEN_RESUME;
  structured.decision.shouldEscalate = false;
  structured.reasonCodes.push(REASON_CODES.OFFICE_LOCATION_FAQ);
  structured.reasonCodes.push(REASON_CODES.LOCATION_PREFERENCE_NOT_HANDOFF);
  structured.reasonCodes.push(REASON_CODES.FAQ_RESUME_NEXT_UNRESOLVED);
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    nearbyCityPreference: interpretation?.entities?.nearbyCityPreference || null,
    preserveKnownLocation: true,
    locationPreferenceOnly: true,
    city: context.knownFacts?.city || null,
    state: context.knownFacts?.state || null,
    organizationId: context.organizationId || null,
    organizationName: context.organizationName || null
  };
  return true;
}

function applyMissedOfficeHoursFaq(structured, context, interpretation) {
  const text = inboundTextFromInterpretation(interpretation);
  if (
    interpretation?.intent !== INTENTS.OFFICE_HOURS_QUESTION &&
    !looksLikeOfficeHoursQuestion(text)
  ) {
    return false;
  }
  applyOfficeHoursResume(structured, context, interpretation);
  return true;
}

function applyOfficeHoursResume(structured, context, interpretation) {
  buildFaqResumeDecision(
    structured,
    context,
    INTENTS.OFFICE_HOURS_QUESTION,
    "office_hours_faq_then_resume",
    interpretation
  );
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  if (lastQ === "confirm_in_person_travel") {
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      resumeTemplateKey: "confirm_in_person_travel_doral",
      preferredMeetingType: "in_person",
      meetingType: "in_person"
    };
    structured.contextPatch = {
      ...(structured.contextPatch || {}),
      knownFacts: {
        ...((structured.contextPatch && structured.contextPatch.knownFacts) || {}),
        meetingTypeRequested: "in_person",
        preferredMeetingType:
          context.knownFacts?.preferredMeetingType === "zoom"
            ? "in_person"
            : context.knownFacts?.preferredMeetingType || "in_person",
        meetingPreferenceSource:
          context.knownFacts?.meetingPreferenceSource || "prospect_requested"
      },
      conversation: {
        ...((structured.contextPatch && structured.contextPatch.conversation) || {}),
        lastQuestionAsked: "confirm_in_person_travel",
        pendingClarification: "confirm_in_person_travel"
      }
    };
  }
  structured.decision.nextAction = NEXT_ACTIONS.ANSWER_OFFICE_HOURS_THEN_RESUME;
  structured.decision.shouldEscalate = false;
  structured.reasonCodes.push(REASON_CODES.OFFICE_HOURS_FAQ);
  structured.reasonCodes.push(REASON_CODES.FAQ_RESUME_NEXT_UNRESOLVED);
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
}

function applyMissedAvailableDaysAsk(structured, context, interpretation, availability) {
  const text = inboundTextFromInterpretation(interpretation);
  if (
    interpretation?.intent !== INTENTS.REQUEST_AVAILABLE_DAYS &&
    !looksLikeAvailableDaysQuestion(text)
  ) {
    return false;
  }
  const offered = applyAvailableDaysOffer({
    structured,
    context,
    interpretation,
    availability
  });
  return Boolean(offered);
}

function hasConcreteRequestedClock(context, interpretation) {
  const value =
    interpretation?.entities?.requestedTime ||
    context?.appointment?.proposedTime ||
    null;
  return /^\d{1,2}:\d{2}/.test(String(value || ""));
}

function shouldOfferDaysFirst(context, interpretation) {
  if (context?.appointment?.proposedDate) {
    return false;
  }
  if (hasConcreteRequestedClock(context, interpretation)) {
    return false;
  }
  const earliest =
    interpretation?.entities?.availabilityConstraint?.earliestTime ||
    context?.knownFacts?.availabilityConstraint?.earliestTime ||
    null;
  if (/^\d{1,2}:\d{2}/.test(String(earliest || ""))) {
    return false;
  }
  const intent = interpretation?.intent;
  if (
    intent === INTENTS.REQUEST_AVAILABLE_DAYS ||
    interpretation?.entities?.requestsAvailableDays
  ) {
    return true;
  }
  return intent === INTENTS.PROVIDE_DAY_PART;
}

function applyAvailableDaysOffer({
  structured,
  context,
  interpretation,
  availability
}) {
  const dayPart =
    interpretation?.entities?.dayPart ||
    context.knownFacts?.preferredDayPart ||
    null;
  const constraintPatch = {
    knownFacts: {
      preferredDayPart: dayPart || context.knownFacts?.preferredDayPart || null,
      availabilityConstraint: dayPart
        ? {
            type: "availability_constraint",
            dayPart,
            earliestTime: null,
            latestTime: null,
            earliestTimeInclusive: true,
            raw: interpretation?.entities?.rawText || null
          }
        : context.knownFacts?.availabilityConstraint || null
    },
    conversation: {
      lastProspectIntent:
        interpretation?.intent || INTENTS.REQUEST_AVAILABLE_DAYS
    },
    currentStage: STAGES.SCHEDULING
  };
  const offered = tryApplyAvailabilityOffer({
    structured,
    context,
    interpretation,
    availability,
    constraintPatch
  });
  if (offered) {
    offered.reasonCodes.push(REASON_CODES.DAY_FIRST_AVAILABILITY_OFFERED);
    offered.reasonCodes.push(REASON_CODES.NO_STALE_TIME_FALLBACK);
    offered.reasonCodes.push(REASON_CODES.NO_DEAD_END_CONTINUATION);
    if (offered.customerReplyPlan) {
      offered.customerReplyPlan.entities = {
        ...offered.customerReplyPlan.entities,
        dayFirstOffer: shouldOfferDaysFirst(context, interpretation),
        dayPart,
        preferredDayPart: dayPart
      };
    }
    return offered;
  }
  structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_DAY_PART_ASK_TIME;
  structured.decision.shouldEscalate = false;
  structured.decision.mayCreateAppointment = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = "ask_available_day";
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    dayPart,
    preferredDayPart: dayPart,
    dayFirstOffer: true
  };
  structured.reasonCodes.push(REASON_CODES.DAY_FIRST_AVAILABILITY_OFFERED);
  structured.reasonCodes.push(REASON_CODES.NO_STALE_TIME_FALLBACK);
  structured.contextPatch = {
    ...constraintPatch,
    conversation: {
      ...constraintPatch.conversation,
      lastQuestionAsked: "ask_date",
      pendingClarification: null,
      clarificationCount: 0
    }
  };
  return structured;
}

/** Implements BR-229 — do not emit generic pending-data copy for known continuity. */
function applyPendingContinuityInsteadOfClarify(structured, context, interpretation, availability) {
  if (applyMissedJobFaq(structured, context, interpretation)) {
    return true;
  }
  if (applyMissedOfficeLocationFaq(structured, context, interpretation)) {
    return true;
  }
  if (applyMissedOfficeHoursFaq(structured, context, interpretation)) {
    return true;
  }
  if (applyMissedAvailableDaysAsk(structured, context, interpretation, availability)) {
    return true;
  }
  const text = inboundTextFromInterpretation(interpretation);
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  if (
    lastQ === "ask_authorization" &&
    isBareConversationalYes(text) &&
    context?.knownFacts?.workAuthorization !== true &&
    context?.knownFacts?.workAuthorization !== false
  ) {
    structured.reasonCodes.push(REASON_CODES.PENDING_ANSWER_REJECTED);
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey =
      "continue_qualification_after_authorization";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      city: context.knownFacts?.city || null,
      state: context.knownFacts?.state || null,
      workAuthorization: true,
      workAuthorizationStatus: WORK_AUTHORIZATION.AUTHORIZED,
      organizationId: context.organizationId || null,
      organizationName: context.organizationName || null
    };
    structured.reasonCodes.push(REASON_CODES.AUTHORIZATION_CAPTURED);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      knownFacts: {
        workAuthorization: true,
        workAuthorizationStatus: WORK_AUTHORIZATION.AUTHORIZED
      },
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastProspectIntent: INTENTS.PROVIDE_AUTHORIZATION,
        clarificationCount: 0,
        pendingClarification: null
      }
    };
    return true;
  }
  return false;
}

/** Implements BR-164 — every turn must declare respond|wait|suppress + reason. */
function ensureExplicitOutboundDecision(structured) {
  if (!structured) {
    return structured;
  }
  if (structured.outboundDecision?.action && structured.outboundDecision?.reason) {
    return structured;
  }
  const next = structured.decision?.nextAction || "";
  const templateKey = structured.customerReplyPlan?.templateKey || "";
  const reason =
    (Array.isArray(structured.reasonCodes) && structured.reasonCodes[0]) ||
    next ||
    "explicit_outbound";
  if (next === "wait" || next === NEXT_ACTIONS.WAIT) {
    structured.outboundDecision = { action: "wait", reason };
    return structured;
  }
  if (next === "suppress" || next === NEXT_ACTIONS.SUPPRESS) {
    structured.outboundDecision = { action: "suppress", reason };
    return structured;
  }
  if (!templateKey) {
    structured.decision = structured.decision || {};
    structured.decision.nextAction =
      structured.decision.nextAction || NEXT_ACTIONS.CLARIFY_ONCE;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan = structured.customerReplyPlan || {};
    structured.customerReplyPlan.templateKey = "clarify_once";
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes = structured.reasonCodes || [];
    structured.reasonCodes.push(REASON_CODES.NO_SILENT_TERMINAL);
    structured.outboundDecision = {
      action: "respond",
      reason: REASON_CODES.NO_SILENT_TERMINAL
    };
    return structured;
  }
  structured.outboundDecision = { action: "respond", reason };
  return structured;
}

/**
 * BR-115 / SELECT_OPTION — shared confirmation transition for an offered slot.
 */
function isExistingAppointmentReschedule(context = {}) {
  const status = String(context?.appointment?.status || "").toLowerCase();
  if (status === APPOINTMENT_STATUS.RESCHEDULE_REQUESTED) {
    return true;
  }
  const appointmentId = context?.appointment?.appointmentId || null;
  if (!appointmentId) {
    return false;
  }
  return (
    status === APPOINTMENT_STATUS.CONFIRMED ||
    status === "scheduled" ||
    status === "rescheduled"
  );
}

function applySelectedOfferedSlotDecision(
  structured,
  selected,
  offered,
  { reasonCodes = [], context = null } = {}
) {
  const selectedDate = slotDate(selected);
  const selectedTime = slotTime(selected);
  const reschedule = isExistingAppointmentReschedule(context);
  structured.decision.nextAction = NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION;
  structured.decision.requiresExplicitConfirmation = true;
  structured.decision.mayCreateAppointment = false;
  structured.decision.mayRescheduleAppointment = false;
  structured.decision.shouldEscalate = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = "confirm_selected_slot";
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    requestedDate: selectedDate,
    requestedTime: selectedTime,
    dateLabel: selectedDate,
    timezone: selected?.timezone || context?.timezone || null,
    now: context?._testNow || null
  };
  for (const code of reasonCodes) {
    structured.reasonCodes.push(code);
  }
  structured.reasonCodes.push(REASON_CODES.EXPLICIT_CONFIRMATION_REQUIRED);
  structured.reasonCodes.push(REASON_CODES.PREMATURE_BOOKING_BLOCKED);
  structured.contextPatch = {
    appointment: {
      status: reschedule
        ? APPOINTMENT_STATUS.RESCHEDULE_REQUESTED
        : APPOINTMENT_STATUS.PROPOSED,
      appointmentId: context?.appointment?.appointmentId || null,
      proposedDate: selectedDate,
      proposedTime: selectedTime,
      previouslyOfferedSlots: offered
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      pendingClarification: null,
      clarificationCount: 0
    },
    currentStage: reschedule ? STAGES.RESCHEDULING : STAGES.PROPOSED
  };
  return structured;
}

/**
 * BR-119 — restate only the day-narrowed offered slots (do not broaden).
 */
function applyRestateNarrowedOfferedSlots(
  structured,
  matches,
  { reasonCodes = [], interpretation = null, dateIso = null } = {}
) {
  const offered = Array.isArray(matches) ? matches : [];
  structured.decision.nextAction = NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS;
  structured.decision.requiresExplicitConfirmation = false;
  structured.decision.mayCreateAppointment = false;
  structured.decision.shouldEscalate = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = "offer_available_slots";
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    offeredSlots: offered,
    requestedDate: dateIso || slotDate(offered[0]) || null,
    slotA: slotTime(offered[0]) || null,
    slotB: slotTime(offered[1]) || null,
    timezone: offered[0]?.timezone || null
  };
  for (const code of reasonCodes) {
    structured.reasonCodes.push(code);
  }
  structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
  structured.contextPatch = {
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: dateIso || slotDate(offered[0]) || null,
      previouslyOfferedSlots: offered
    },
    conversation: {
      lastQuestionAsked: "offer_time_choices",
      pendingClarification: null,
      clarificationCount: 0,
      lastProspectIntent: interpretation?.intent || INTENTS.SCHEDULING_DATE_PROPOSAL
    },
    currentStage: STAGES.SCHEDULING,
    attention: { needsHumanAttention: false, reason: null }
  };
  return structured;
}

/**
 * BR-119 — same-day no-op: date already fixed on the offered set; ask which time.
 * Do not re-render the full "Tengo disponible el lunes…" availability sentence.
 */
function applySelectedSlotNoLongerAvailable(
  structured,
  replacements,
  { context = null, interpretation = null } = {}
) {
  const offered = Array.isArray(replacements) ? replacements : [];
  structured.decision.nextAction = NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS;
  structured.decision.requiresExplicitConfirmation = false;
  structured.decision.mayCreateAppointment = false;
  structured.decision.mayRescheduleAppointment = false;
  structured.decision.shouldEscalate = false;
  structured.decision.executionAuthorized = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey =
    offered.length > 0
      ? "selected_slot_no_longer_available"
      : "acknowledge_no_qualifying_availability";
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    offeredSlots: offered,
    requestedDate: slotDate(offered[0]) || context?.appointment?.proposedDate || null,
    requestedTime: context?.appointment?.proposedTime || null,
    slotA: slotTime(offered[0]) || null,
    slotB: slotTime(offered[1]) || null,
    timezone: offered[0]?.timezone || context?.timezone || null
  };
  structured.reasonCodes.push(REASON_CODES.SELECTED_SLOT_NO_LONGER_AVAILABLE);
  structured.reasonCodes.push(REASON_CODES.SLOT_UNAVAILABLE_OFFER_ALTERNATIVES);
  structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
  structured.contextPatch = {
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      appointmentId: null,
      proposedDate: null,
      proposedTime: null,
      confirmedDate: null,
      confirmedTime: null,
      previouslyOfferedSlots: offered
    },
    conversation: {
      lastQuestionAsked:
        offered.length > 0 ? "offer_time_choices" : "ask_day_part",
      lastProspectIntent: interpretation?.intent || INTENTS.SCHEDULE_CONFIRM,
      lastOfferMade:
        offered.length > 0
          ? "selected_slot_no_longer_available"
          : "acknowledge_no_qualifying_availability",
      pendingClarification: null,
      clarificationCount: 0
    },
    currentStage: STAGES.SCHEDULING,
    attention: { needsHumanAttention: false, reason: null }
  };
  return structured;
}

function applyAskWhichOfferedTime(
  structured,
  matches,
  { reasonCodes = [], interpretation = null, dateIso = null } = {}
) {
  const offered = Array.isArray(matches) ? matches : [];
  structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
  structured.decision.requiresExplicitConfirmation = false;
  structured.decision.mayCreateAppointment = false;
  structured.decision.shouldEscalate = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = "clarify_offered_slot_time";
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    offeredSlots: offered,
    requestedDate: dateIso || slotDate(offered[0]) || null,
    slotA: slotTime(offered[0]) || null,
    slotB: slotTime(offered[1]) || null,
    timezone: offered[0]?.timezone || null
  };
  for (const code of reasonCodes) {
    structured.reasonCodes.push(code);
  }
  structured.reasonCodes.push(REASON_CODES.OFFERED_SLOT_DAY_ALREADY_FIXED);
  structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
  structured.contextPatch = {
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: dateIso || slotDate(offered[0]) || null,
      previouslyOfferedSlots: offered
    },
    conversation: {
      lastQuestionAsked: "offer_time_choices",
      pendingClarification: null,
      clarificationCount: 0,
      lastProspectIntent: interpretation?.intent || INTENTS.SCHEDULING_DATE_PROPOSAL
    },
    currentStage: STAGES.SCHEDULING,
    attention: { needsHumanAttention: false, reason: null }
  };
  return structured;
}

/**
 * BR-107 — apply read-only availability offer when orchestrator supplied facts.
 * Returns structured decision when handled; null to continue normal path.
 */
function tryApplyAvailabilityOffer({
  structured,
  context,
  interpretation,
  availability,
  constraintPatch = null
}) {
  if (!availability) {
    return null;
  }

  const status = availability.status || null;
  const alternatives = Array.isArray(availability.nearestAlternatives)
    ? availability.nearestAlternatives
    : [];
  const earliestTime =
    interpretation?.entities?.availabilityConstraint?.earliestTime ||
    context.knownFacts?.availabilityConstraint?.earliestTime ||
    null;
  const dayFirstOffer = shouldOfferDaysFirst(context, interpretation);
  const proposedDate = dayFirstOffer
    ? context.appointment?.proposedDate || null
    : interpretation?.entities?.resolvedDate?.isoDate ||
      context.appointment?.proposedDate ||
      null;
  const dateLabel = resolveDateLabel(
    {
      ...context,
      appointment: {
        ...context.appointment,
        proposedDate
      }
    },
    structured.preferredLanguage || "spanish"
  );

  // Read failed / missing agent / no date in reader → BR-105 fallback (caller continues).
  if (
    availability.providerFailure === true ||
    status === READ_STATUS.UNAVAILABLE ||
    availability.checked === false
  ) {
    structured.reasonCodes.push(REASON_CODES.AVAILABILITY_READ_UNAVAILABLE);
    return null;
  }

  const rolling = Boolean(availability.rolling || availability.readResult?.rolling);

  if (status === READ_STATUS.ZERO_SLOTS || (availability.checked && alternatives.length === 0)) {
    structured.decision.nextAction = NEXT_ACTIONS.ACKNOWLEDGE_NO_QUALIFYING_AVAILABILITY;
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "acknowledge_no_qualifying_availability";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      earliestTime: earliestTime || null,
      dateLabel: proposedDate ? dateLabel : null,
      requestedDate: proposedDate,
      dayPart:
        interpretation?.entities?.dayPart ||
        context.knownFacts?.preferredDayPart ||
        null,
      preferredDayPart:
        interpretation?.entities?.dayPart ||
        context.knownFacts?.preferredDayPart ||
        null,
      dayFirstOffer: shouldOfferDaysFirst(context, interpretation),
      rollingSearch: rolling
    };
    structured.reasonCodes.push(REASON_CODES.NO_STALE_TIME_FALLBACK);
    structured.reasonCodes.push(REASON_CODES.ZERO_QUALIFYING_SLOTS);
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    if (rolling) {
      structured.reasonCodes.push(REASON_CODES.ROLLING_AVAILABILITY_SEARCH);
    }
    structured.contextPatch = {
      ...(constraintPatch || {}),
      knownFacts: {
        ...(constraintPatch?.knownFacts || {}),
        availabilityConstraint:
          interpretation?.entities?.availabilityConstraint ||
          context.knownFacts?.availabilityConstraint ||
          null
      },
      appointment: {
        ...(constraintPatch?.appointment || {}),
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate,
        previouslyOfferedSlots: []
      },
      conversation: {
        ...(constraintPatch?.conversation || {}),
        // Rolling zero → ask different time preference; single-day zero may ask date.
        lastQuestionAsked: rolling ? "ask_time_preference" : "ask_date",
        pendingClarification: null,
        clarificationCount: 0,
        lastProspectIntent: interpretation?.intent || null
      },
      attention: { needsHumanAttention: false, reason: null },
      currentStage: STAGES.SCHEDULING
    };
    return structured;
  }

  if (status === READ_STATUS.AVAILABLE && alternatives.length > 0) {
    const requestedClock =
      interpretation?.entities?.requestedTime ||
      context.appointment?.proposedTime ||
      null;
    const exactMatches = alternatives.filter((slot) => {
      const time = slot.time || slot.timeKey || null;
      const date = slot.date || slot.dateKey || null;
      if (!requestedClock || String(time) !== String(requestedClock)) {
        return false;
      }
      if (proposedDate && date && String(date) !== String(proposedDate)) {
        return false;
      }
      return true;
    });
    // Implements BR-164 / BR-116 — exact requested time + date → confirm that slot only.
    if (
      availability.requestedSlotAvailable === true &&
      requestedClock &&
      exactMatches.length === 1
    ) {
      applySelectedOfferedSlotDecision(structured, exactMatches[0], exactMatches, {
        reasonCodes: [
          REASON_CODES.EXACT_REQUESTED_TIME_CONFIRMED,
          REASON_CODES.AVAILABLE_SLOTS_OFFERED,
          REASON_CODES.SCHEDULING_HANDOFF_GUARD
        ],
        context
      });
      const mergedConstraint = mergeSchedulingConstraints(
        context.knownFacts?.availabilityConstraint || null,
        interpretation?.entities?.availabilityConstraint || null,
        context,
        interpretation
      );
      structured.contextPatch = {
        ...(constraintPatch || {}),
        ...(structured.contextPatch || {}),
        knownFacts: {
          ...(constraintPatch?.knownFacts || {}),
          ...(structured.contextPatch?.knownFacts || {}),
          availabilityConstraint: mergedConstraint
        },
        appointment: {
          ...(constraintPatch?.appointment || {}),
          ...(structured.contextPatch?.appointment || {}),
          previouslyOfferedSlots: exactMatches
        },
        attention: { needsHumanAttention: false, reason: null }
      };
      return structured;
    }

    const isNearest = Boolean(
      availability.alternativeToConstraint ||
        availability.readResult?.alternativeToConstraint
    );
    structured.decision.nextAction = NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS;
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = isNearest
      ? "offer_nearest_alternatives"
      : "offer_available_slots";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      earliestTime,
      dateLabel,
      requestedDate: proposedDate,
      offeredSlots: alternatives,
      slotA: alternatives[0]?.time || null,
      slotB: alternatives[1]?.time || null,
      rollingSearch: rolling,
      nearestAlternatives: isNearest,
      todayUnavailableAfterLead: Boolean(availability.todayUnavailableAfterLead),
      now: context._testNow || null,
      timezone: context.timezone || alternatives[0]?.timezone || null,
      dayFirstOffer,
      dayPart:
        interpretation?.entities?.dayPart ||
        context.knownFacts?.preferredDayPart ||
        null,
      preferredDayPart:
        interpretation?.entities?.dayPart ||
        context.knownFacts?.preferredDayPart ||
        null
    };
    if (dayFirstOffer) {
      structured.reasonCodes.push(REASON_CODES.DAY_FIRST_AVAILABILITY_OFFERED);
      structured.reasonCodes.push(REASON_CODES.NO_STALE_TIME_FALLBACK);
    }
    structured.reasonCodes.push(REASON_CODES.AVAILABLE_SLOTS_OFFERED);
    if (isNearest) {
      structured.reasonCodes.push(REASON_CODES.ZERO_QUALIFYING_SLOTS);
    }
    structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
    if (rolling) {
      structured.reasonCodes.push(REASON_CODES.ROLLING_AVAILABILITY_SEARCH);
    }
    const mergedConstraint = mergeSchedulingConstraints(
      context.knownFacts?.availabilityConstraint || null,
      interpretation?.entities?.availabilityConstraint || null,
      context,
      interpretation
    );
    structured.contextPatch = {
      ...(constraintPatch || {}),
      knownFacts: {
        ...(constraintPatch?.knownFacts || {}),
        availabilityConstraint: mergedConstraint
      },
      appointment: {
        ...(constraintPatch?.appointment || {}),
        status: APPOINTMENT_STATUS.PROPOSED,
        // Keep concrete date if already known; rolling offers carry dates on slots.
        proposedDate,
        previouslyOfferedSlots: alternatives
      },
      conversation: {
        ...(constraintPatch?.conversation || {}),
        lastQuestionAsked: "offer_time_choices",
        pendingClarification: null,
        clarificationCount: 0,
        lastProspectIntent: interpretation?.intent || null
      },
      attention: { needsHumanAttention: false, reason: null },
      currentStage: STAGES.SCHEDULING
    };
    return structured;
  }

  return null;
}

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
      mayRescheduleAppointment: false,
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
      organizationId: context.organizationId || null,
      organizationName: context.organizationName || null,
      officeAddress: context.officeAddress || null,
      officeAddressSource: context.officeAddressSource || null,
      entities: {
        ...(interpretation.entities || {}),
        officeAddress: context.officeAddress || null,
        officeAddressSource: context.officeAddressSource || null,
        organizationId: context.organizationId || null,
        organizationName: context.organizationName || null
      }
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

/**
 * Implements BR-102 — retain parseable state, ask city only, stay Active.
 * Confirmed state does not regress to partial or a different code.
 */
function applyStateOnlyAskCity(structured, context, interpretation, state) {
  const priorState = context?.knownFacts?.state || null;
  const priorConfirmed =
    Boolean(priorState) &&
    String(context?.knownFacts?.stateCertainty || "").toLowerCase() === "confirmed";
  const retainedState = priorConfirmed ? priorState : state || priorState || null;

  structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_LOCATION;
  structured.decision.shouldEscalate = false;
  structured.reasonCodes.push(REASON_CODES.PARTIAL_LOCATION);
  structured.reasonCodes.push(REASON_CODES.STATE_ONLY_LOCATION);
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = "ask_city";
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    city: null,
    state: retainedState,
    proposedState: retainedState
  };
  structured.contextPatch = {
    currentStage: STAGES.QUALIFICATION,
    knownFacts: {
      city: null,
      state: retainedState,
      cityCertainty: "unknown",
      stateCertainty: priorConfirmed ? "confirmed" : "partial",
      proposedState: null
    },
    conversation: {
      ...bumpClarification(context, "ask_city"),
      lastQuestionAsked: "ask_city",
      lastProspectIntent: interpretation?.intent || INTENTS.PROVIDE_LOCATION
    },
    attention: { needsHumanAttention: false, reason: null }
  };
  return structured;
}

function isCityUnresolvedForStateOnly(context) {
  const city = context?.knownFacts?.city;
  const certainty = String(context?.knownFacts?.cityCertainty || "unknown").toLowerCase();
  if (!city || certainty === "unknown") {
    return true;
  }
  return isStateNameNotCity(city);
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
  // Implements BR-131 — treat known non-unknown location facts as usable for resume
  // (do not regress to city/state when values are already present).
  const cityKnown =
    Boolean(facts.city) && facts.cityCertainty !== "unknown";
  const stateKnown =
    Boolean(facts.state) && facts.stateCertainty !== "unknown";

  if (!facts.city || facts.cityCertainty === "unknown") {
    return {
      templateKey: "greeting_ask_location",
      lastQuestionAsked: "ask_location"
    };
  }
  if (!stateKnown) {
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
  if (!cityKnown) {
    return {
      templateKey: "greeting_ask_location",
      lastQuestionAsked: "ask_location"
    };
  }
  const authKnown =
    facts.workAuthorization === true ||
    facts.workAuthorization === false ||
    facts.workAuthorizationStatus === WORK_AUTHORIZATION.AUTHORIZED ||
    facts.workAuthorizationStatus === WORK_AUTHORIZATION.NOT_AUTHORIZED;

  if (!authKnown) {
    return {
      templateKey: "continue_qualification_after_location",
      lastQuestionAsked: "ask_authorization"
    };
  }

  // Implements BR-131 FAQ resume guard — never re-ask day-part when already known.
  const dayPart = String(facts.preferredDayPart || "").toLowerCase();
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

  // BR-087 — do not re-ask day-part when slot/constraint already known.
  // resolveQualificationResume only has knownFacts; callers with full context
  // use resolveSchedulingQuestionSkip separately.
  const modality = resolveMeetingModalityForLocation({
    ...facts,
    organizationId: context.organizationId,
    localCities: context.localCities,
    coverageCitiesSource: context.coverageCitiesSource
  });
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
    state: facts.state,
    organizationId: facts.organizationId || null,
    localCities: facts.localCities,
    coverageCitiesSource: facts.coverageCitiesSource || null
  });
  const outside = coverage.coverage === "OUTSIDE";
  const source = facts.meetingPreferenceSource || null;
  const prior = facts.preferredMeetingType || null;
  const prospectZoom =
    prior === "zoom" && (source === "prospect" || source === "prospect_confirmed");

  if (outside) {
    // Prospect-requested in-person must persist until they change modality.
    // Do not silently snap back to Zoom after "puede ser presencial".
    const prospectInPerson =
      prior === "in_person" &&
      (source === "prospect_confirmed" || source === "prospect_requested");
    if (prospectInPerson) {
      return {
        coverage: "OUTSIDE",
        meetingType: "in_person",
        meetingPreferenceSource: source,
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
  const factResume = factResumeFromContext(context);
  // Implements BR-164 — persisted facts outrank stale lastQuestionAsked.
  if (factsAheadOfLastQuestion(lastQ, factResume)) {
    return factResume;
  }
  if (lastQ === "ask_authorization") {
    const facts = context?.knownFacts || {};
    const authKnown =
      facts.workAuthorization === true ||
      facts.workAuthorization === false ||
      facts.workAuthorizationStatus === WORK_AUTHORIZATION.AUTHORIZED ||
      facts.workAuthorizationStatus === WORK_AUTHORIZATION.NOT_AUTHORIZED;
    // Same-turn auth captured beside FAQ (or already known) — resume next missing field.
    if (!authKnown) {
      return {
        templateKey: "continue_qualification_after_location",
        lastQuestionAsked: "ask_authorization"
      };
    }
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
  if (lastQ === "confirm_in_person_travel") {
    return {
      templateKey: "confirm_in_person_travel_doral",
      lastQuestionAsked: "confirm_in_person_travel",
      entities: {
        preferredMeetingType: "in_person",
        meetingType: "in_person"
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

/**
 * Same-turn work-auth entity attached beside FAQ (pending ask_authorization compounds).
 */
function inboundTextFromInterpretation(interpretation) {
  return String(
    interpretation?.entities?.rawText ||
      interpretation?.normalization?.rawText ||
      interpretation?.rawText ||
      ""
  );
}

/**
 * BR-131 — first-turn precedence. Resume / clarify_once copy that claims
 * Atlas already asked something is impossible without conversation evidence.
 */
function applyFirstTurnWhenNoPriorAtlasQuestion(
  structured,
  context,
  interpretation
) {
  if (hasConcretePriorAtlasQuestion(context)) {
    return false;
  }

  const text = inboundTextFromInterpretation(interpretation);
  const looksInfo =
    looksLikeSpanishInfoRequest(text) ||
    looksLikeEnglishInfoRequest(text) ||
    looksLikeJobOverviewQuestion(text) ||
    looksLikeJobOpportunityQuestion(text);

  if (looksInfo) {
    buildFaqResumeDecision(
      structured,
      context,
      INTENTS.JOB_OPPORTUNITY_QUESTION,
      "job_overview_faq_then_resume",
      interpretation
    );
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_JOB_OPPORTUNITY_THEN_RESUME;
    structured.reasonCodes.push(
      REASON_CODES.FIRST_TURN_PRECEDENCE_NO_PRIOR_QUESTION
    );
    structured.reasonCodes.push(REASON_CODES.JOB_OVERVIEW_FAQ);
    return true;
  }

  structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_AFTER_GREETING;
  structured.decision.shouldEscalate = false;
  structured.customerReplyPlan.acknowledgeRequest = true;
  structured.customerReplyPlan.templateKey = "greeting_ask_location";
  structured.reasonCodes.push(
    REASON_CODES.FIRST_TURN_PRECEDENCE_NO_PRIOR_QUESTION
  );
  structured.reasonCodes.push(REASON_CODES.GREETING_NO_ESCALATE);
  structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
  structured.contextPatch = {
    currentStage: STAGES.QUALIFICATION,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastProspectIntent: interpretation?.intent || INTENTS.UNKNOWN,
      clarificationCount: 0,
      pendingClarification: null
    }
  };
  return true;
}

function withSameTurnAuthorizationFacts(context, interpretation) {
  const wa = interpretation?.entities?.workAuthorization;
  if (wa !== true && wa !== false) {
    return context;
  }
  return {
    ...context,
    knownFacts: {
      ...(context?.knownFacts || {}),
      workAuthorization: wa === true,
      workAuthorizationStatus:
        wa === true
          ? WORK_AUTHORIZATION.AUTHORIZED
          : WORK_AUTHORIZATION.NOT_AUTHORIZED
    }
  };
}

function buildFaqResumeDecision(
  structured,
  context,
  intent,
  templateKey,
  interpretation = null
) {
  let resume = resolvePendingResume(context);
  // Implements BR-131 — never regress FAQ resume to location when later facts are known.
  const guarded = resolveFaqResumeTemplateKeyFromFacts({
    city: context.knownFacts?.city,
    state: context.knownFacts?.state,
    proposedState: context.knownFacts?.proposedState,
    cityCertainty: context.knownFacts?.cityCertainty,
    stateCertainty: context.knownFacts?.stateCertainty,
    workAuthorization: context.knownFacts?.workAuthorization,
    workAuthorizationStatus: context.knownFacts?.workAuthorizationStatus,
    preferredDayPart: context.knownFacts?.preferredDayPart
  });
  if (
    resume.templateKey === "greeting_ask_location" &&
    guarded.templateKey !== "greeting_ask_location"
  ) {
    resume = guarded;
  } else if (factsAheadOfLastQuestion(resume.lastQuestionAsked, guarded)) {
    // Implements BR-164 — FAQ resume uses next unresolved fact, not stale lastQ.
    resume = guarded;
  }
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
    softInterviewTransition: shouldSoftInviteInterview(
      context.knownFacts || {},
      resume.lastQuestionAsked
    ),
    prospectGoalTheme: context.knownFacts?.prospectGoalTheme || null,
    workAuthorization: context.knownFacts?.workAuthorization,
    workAuthorizationStatus: context.knownFacts?.workAuthorizationStatus,
    ...resume.entities
  };
  structured.reasonCodes.push(REASON_CODES.DIRECT_QUESTION_ANSWERED);
  structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_SCHEDULING);
  structured.reasonCodes.push(REASON_CODES.SPECIFIC_FAQ_ANSWERED);
  structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
  structured.reasonCodes.push(REASON_CODES.OBJECTION_ACK_ANSWER_CONTINUE);
  if (structured.customerReplyPlan.entities.softInterviewTransition) {
    structured.reasonCodes.push(REASON_CODES.SOFT_INTERVIEW_TRANSITION);
  }
  if (
    resume.templateKey === "ask_time_after_constraint" ||
    resume.entities?.earliestTime
  ) {
    structured.reasonCodes.push(REASON_CODES.MOST_SPECIFIC_SCHEDULING_RESUME);
  }
  const waEntity = interpretation?.entities?.workAuthorization;
  const knownFactsPatch =
    waEntity === true || waEntity === false
      ? {
          workAuthorization: waEntity === true,
          workAuthorizationStatus:
            waEntity === true
              ? WORK_AUTHORIZATION.AUTHORIZED
              : WORK_AUTHORIZATION.NOT_AUTHORIZED
        }
      : null;
  structured.contextPatch = {
    currentStage: context.currentStage || STAGES.QUALIFICATION,
    ...(knownFactsPatch ? { knownFacts: knownFactsPatch } : {}),
    conversation: {
      clarificationCount: 0,
      pendingClarification:
        resume.lastQuestionAsked === "clarify_license_type"
          ? "clarify_license_type"
          : null,
      lastQuestionAsked: resume.lastQuestionAsked,
      lastProspectIntent: intent,
      ...(knownFactsPatch
        ? {
            confirmedFields: Array.from(
              new Set([
                ...(context.conversation?.confirmedFields || []),
                "workAuthorization"
              ])
            )
          }
        : {})
    }
  };
  return structured;
}

/**
 * Decide next business action from context + interpretation.
 * Availability is optional injected tool result (read-only).
 */
// Implements BR-170 — same-turn citizenship / work-auth must outrank a stale
// lastQuestionAsked so meeting-preference and SSN replies never re-ask it.
function mergeWorkAuthFacts(context, interpretation) {
  const facts = { ...(context?.knownFacts || {}) };
  const wa = interpretation?.entities?.workAuthorization;
  if (wa === true || wa === false) {
    facts.workAuthorization = wa;
    facts.workAuthorizationStatus = wa
      ? WORK_AUTHORIZATION.AUTHORIZED
      : WORK_AUTHORIZATION.NOT_AUTHORIZED;
  }
  return facts;
}

function decideConversationTurnCore({
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
      requestedSlotAvailable:
        availability.requestedSlotAvailable == null
          ? null
          : Boolean(availability.requestedSlotAvailable),
      nearestAlternatives: availability.nearestAlternatives || [],
      checked: availability.checked !== false,
      status: availability.status || null,
      providerFailure: Boolean(availability.providerFailure),
      agentResolutionSource: availability.agentResolutionSource || null
    };
  }

  const iulDecision = applyIulAdDecision({
    structured,
    context,
    interpretation,
    availability
  });
  if (iulDecision) {
    return iulDecision;
  }

  if (intent === INTENTS.GREETING) {
    // Implements BR-131 — natural greeting + one next-needed question (no fact regression).
    const resume = resolveQualificationResume(context);
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_AFTER_GREETING;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.GREETING_NO_ESCALATE);
    structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);

    if (resume.lastQuestionAsked === "ask_location") {
      structured.customerReplyPlan.templateKey = "greeting_ask_location";
      structured.contextPatch = {
        currentStage: STAGES.QUALIFICATION,
        conversation: {
          lastQuestionAsked: "ask_location",
          lastProspectIntent: INTENTS.GREETING
        }
      };
      return structured;
    }

    structured.customerReplyPlan.templateKey = "greeting_then_resume";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      resumeTemplateKey: resume.templateKey,
      ...(resume.entities || {}),
      city: context.knownFacts?.city || resume.entities?.city || null,
      proposedState:
        context.knownFacts?.proposedState ||
        resume.entities?.proposedState ||
        null,
      state: context.knownFacts?.state || null
    };
    structured.contextPatch = {
      currentStage:
        resume.lastQuestionAsked === "ask_authorization" ||
        resume.lastQuestionAsked === "ask_state" ||
        resume.lastQuestionAsked === "confirm_location" ||
        resume.lastQuestionAsked === "ask_city"
          ? STAGES.QUALIFICATION
          : context.currentStage || STAGES.QUALIFICATION,
      conversation: {
        lastQuestionAsked: resume.lastQuestionAsked,
        lastProspectIntent: INTENTS.GREETING
      }
    };
    return structured;
  }

  // Implements BR-124 — explicit schedule ask while no confirmed appointment recovers
  // from stale clarification / DAY_PART-stall residue into the next real missing step.
  if (intent === INTENTS.REQUEST_SCHEDULE_INTERVIEW) {
    const status = String(context.appointment?.status || "").toLowerCase();
    const appointmentId = context.appointment?.appointmentId || null;
    const confirmed =
      (status === String(APPOINTMENT_STATUS.CONFIRMED).toLowerCase() ||
        status === "confirmed") &&
      Boolean(appointmentId);

    if (confirmed) {
      // Keep existing confirmed-booking reschedule semantics unchanged.
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
        currentStage: STAGES.RESCHEDULING,
        conversation: {
          lastProspectIntent: INTENTS.REQUEST_SCHEDULE_INTERVIEW,
          clarificationCount: 0,
          pendingClarification: null,
          lastClarificationTemplateKey: null
        }
      };
      return structured;
    }

    const resume = resolveQualificationResume(context);
    const lastQuestionAsked = resume.lastQuestionAsked;
    structured.decision.nextAction =
      NEXT_ACTIONS.RESUME_SCHEDULING_AFTER_EXPLICIT_REQUEST;
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = resume.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...(resume.entities || {})
    };
    structured.reasonCodes.push(
      REASON_CODES.EXPLICIT_SCHEDULE_INTENT_RECOVERS_AMBIGUITY
    );
    structured.reasonCodes.push(REASON_CODES.ASK_ONLY_MISSING_INFORMATION);
    structured.contextPatch = {
      currentStage:
        lastQuestionAsked === "ask_location" ||
        lastQuestionAsked === "ask_state" ||
        lastQuestionAsked === "ask_authorization" ||
        lastQuestionAsked === "ask_city" ||
        lastQuestionAsked === "confirm_location"
          ? STAGES.QUALIFICATION
          : STAGES.SCHEDULING,
      attention: {
        needsHumanAttention: false,
        reason: null
      },
      conversation: {
        clarificationCount: 0,
        lastClarificationTemplateKey: null,
        pendingClarification: null,
        lastQuestionAsked,
        lastProspectIntent: INTENTS.REQUEST_SCHEDULE_INTERVIEW
      }
    };
    return structured;
  }

  if (intent === INTENTS.OFFICE_LOCATION_QUESTION) {
    if (applyMissedOfficeLocationFaq(structured, context, interpretation)) {
      return structured;
    }
  }

  if (intent === INTENTS.OFFICE_HOURS_QUESTION) {
    applyOfficeHoursResume(structured, context, interpretation);
    return structured;
  }

  if (intent === INTENTS.REQUEST_AVAILABLE_DAYS) {
    return applyAvailableDaysOffer({
      structured,
      context,
      interpretation,
      availability
    });
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
      interpretation.entities?.jobFaqDetailLevel === "overview" ||
      interpretation.entities?.jobFaqDetailLevel === "company_identity";
    if (overviewFaq) {
      structured.reasonCodes.push(REASON_CODES.JOB_OVERVIEW_FAQ);
      structured.reasonCodes.push(REASON_CODES.JOB_FAQ_PROGRESSIVE_DISCLOSURE);
    } else {
      structured.reasonCodes.push(REASON_CODES.NO_INCOME_GUARANTEE);
    }
    const jobFaq = buildFaqResumeDecision(
      structured,
      withSameTurnAuthorizationFacts(context, interpretation),
      intent,
      overviewFaq
        ? "job_overview_faq_then_resume"
        : "job_opportunity_faq_then_resume",
      interpretation
    );
    jobFaq.customerReplyPlan.entities = {
      ...jobFaq.customerReplyPlan.entities,
      jobFaqDetailLevel:
        interpretation.entities?.jobFaqDetailLevel ||
        (overviewFaq ? "overview" : "employment_framing")
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
    if (applyFirstTurnWhenNoPriorAtlasQuestion(structured, context, interpretation)) {
      return structured;
    }
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
    // Implements BR-099 / BR-137 — sales skill/aversion/identity before correction/location.
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_SALES_OBJECTION_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.SALES_OBJECTION_RECOGNIZED);
    structured.reasonCodes.push(REASON_CODES.SALES_OBJECTION_OUTRANKS_CORRECTION);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    if (interpretation.entities?.salesObjectionKind === "identity") {
      structured.reasonCodes.push(REASON_CODES.IS_THIS_SALES_IDENTITY);
    }
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

  if (intent === INTENTS.THINK_ABOUT_IT) {
    // Implements BR-137 — no pressure; clarify or soft-invite when already qualified.
    const qualified = isQualificationCompleteForInterview(
      context.knownFacts || {}
    );
    structured.decision.shouldEscalate = false;
    structured.decision.mayCreateAppointment = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.THINK_ABOUT_IT_CLARIFY);
    structured.reasonCodes.push(REASON_CODES.OBJECTION_ACK_ANSWER_CONTINUE);
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    if (qualified) {
      structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_THINK_ABOUT_IT;
      structured.customerReplyPlan.templateKey =
        "think_about_it_interview_offer";
      structured.reasonCodes.push(REASON_CODES.SOFT_INTERVIEW_TRANSITION);
      structured.contextPatch = {
        currentStage: context.currentStage || STAGES.QUALIFICATION,
        conversation: {
          clarificationCount: 0,
          pendingClarification: null,
          lastProspectIntent: intent,
          lastQuestionAsked: "ask_day_part"
        }
      };
      return structured;
    }
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_THINK_ABOUT_IT;
    structured.customerReplyPlan.templateKey = "think_about_it_clarify";
    structured.contextPatch = {
      currentStage: context.currentStage || STAGES.QUALIFICATION,
      conversation: {
        clarificationCount: 0,
        pendingClarification: "think_about_it",
        lastProspectIntent: intent,
        lastQuestionAsked: "think_about_it_clarify"
      }
    };
    return structured;
  }

  if (intent === INTENTS.LEGITIMACY_TRUST) {
    // Implements BR-137 — calm factual trust response, then resume / soft interview.
    structured.decision.nextAction = NEXT_ACTIONS.ANSWER_LEGITIMACY_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.LEGITIMACY_TRUST_ANSWERED);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "legitimacy_trust_faq_then_resume"
    );
  }

  if (intent === INTENTS.RECRUIT_ROLE_OBJECTION) {
    // Implements BR-137 — truthful recruit-role clarification (no false denial).
    structured.decision.nextAction =
      NEXT_ACTIONS.ANSWER_RECRUIT_ROLE_OBJECTION_THEN_RESUME;
    structured.reasonCodes.push(REASON_CODES.RECRUIT_ROLE_OBJECTION_ANSWERED);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    return buildFaqResumeDecision(
      structured,
      context,
      intent,
      "recruit_role_objection_faq_then_resume"
    );
  }

  if (intent === INTENTS.PROSPECT_GOAL) {
    // Implements BR-137 — optional motivation capture; not a qualification field.
    const theme =
      interpretation.entities?.prospectGoalTheme ||
      context.knownFacts?.prospectGoalTheme ||
      "other";
    const priorGoals = Array.isArray(context.knownFacts?.prospectGoals)
      ? context.knownFacts.prospectGoals
      : [];
    const nextGoals = priorGoals.includes(theme)
      ? priorGoals
      : [...priorGoals, theme].slice(-5);
    structured.decision.nextAction =
      NEXT_ACTIONS.ACKNOWLEDGE_PROSPECT_GOAL_THEN_CONTINUE;
    structured.reasonCodes.push(REASON_CODES.PROSPECT_GOAL_CAPTURED);
    structured.reasonCodes.push(REASON_CODES.FAQ_OUTRANKS_LOCATION);
    const goalDecision = buildFaqResumeDecision(
      structured,
      context,
      intent,
      "prospect_goal_ack_then_resume",
      interpretation
    );
    goalDecision.customerReplyPlan.entities = {
      ...goalDecision.customerReplyPlan.entities,
      prospectGoalTheme: theme
    };
    goalDecision.contextPatch = {
      ...goalDecision.contextPatch,
      knownFacts: {
        ...(goalDecision.contextPatch?.knownFacts || {}),
        prospectGoals: nextGoals,
        prospectGoalTheme: theme
      }
    };
    return goalDecision;
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
    if (applyFirstTurnWhenNoPriorAtlasQuestion(structured, context, interpretation)) {
      return structured;
    }
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
      const modality = resolveMeetingModalityForLocation(
        coverageInputFromContext(context, {
          ...context.knownFacts,
          city,
          state
        })
      );
      const nextFacts = {
        ...context.knownFacts,
        city,
        state,
        zip: interpretation.entities?.zip || context.knownFacts?.zip || null,
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
          zip: interpretation.entities?.zip || context.knownFacts?.zip || null,
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

    const modality = resolveMeetingModalityForLocation(
      coverageInputFromContext(context, context.knownFacts || {})
    );
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
    const rawCity = interpretation.entities?.city || context.knownFacts?.city;
    const city =
      rawCity && !isStateNameNotCity(rawCity)
        ? canonicalizeCityName(rawCity) || rawCity
        : null;
    const priorState = context.knownFacts?.state || null;
    const priorStateCertainty = String(
      context.knownFacts?.stateCertainty || ""
    ).toLowerCase();
    // Implements BR-173 — a later city must keep a previously resolved state.
    const retainableState =
      Boolean(priorState) &&
      (priorStateCertainty === "confirmed" || priorStateCertainty === "partial");
    const state =
      interpretation.entities?.state ||
      (completeness === "partial" && retainableState ? priorState : null);
    const proposedState =
      interpretation.entities?.proposedState || context.knownFacts?.proposedState;

    // Implements BR-102 — state-only partial asks for city in that state.
    if (completeness === "state_only" || (state && !city)) {
      return applyStateOnlyAskCity(structured, context, interpretation, state);
    }

    if ((completeness === "partial" || (city && !state)) && !state) {
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
    if (shouldBlockLocationOverwrite(context.knownFacts || {}, interpretation)) {
      structured.reasonCodes.push(REASON_CODES.LOCATION_OVERWRITE_BLOCKED);
      const resume = resolveQualificationResume(context);
      structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
      structured.customerReplyPlan.templateKey =
        resume.templateKey || "continue_qualification_after_location";
      // Implements BR-187 — speak the confirmed city, not this-turn junk entities.
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        ...(resume.entities || {}),
        city: context.knownFacts?.city || resume.entities?.city || null,
        state: context.knownFacts?.state || null,
        coverage:
          context.knownFacts?.coverage || resume.entities?.coverage || null,
        preferredMeetingType: context.knownFacts?.preferredMeetingType || null
      };
      structured.contextPatch = {
        conversation: {
          clarificationCount: 0,
          pendingClarification: null,
          lastQuestionAsked: resume.lastQuestionAsked || "ask_authorization",
          lastProspectIntent: INTENTS.PROVIDE_LOCATION
        }
      };
      return structured;
    }

    const modality = resolveMeetingModalityForLocation(
      coverageInputFromContext(context, { city, state })
    );
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = "continue_qualification_after_location";
    structured.contextPatch = {
      currentStage: STAGES.QUALIFICATION,
      knownFacts: {
        city: city || null,
        state: state || null,
        zip: interpretation.entities?.zip || context.knownFacts?.zip || null,
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        proposedState: null,
        coverage: modality.coverage,
        preferredMeetingType: modality.meetingType,
        meetingPreferenceSource: modality.meetingPreferenceSource
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

  if (intent === INTENTS.PROVIDE_LANGUAGE_ABILITY) {
    const ability = interpretation.entities?.languageAbility || "bilingual";
    const resume = resolveQualificationResume({
      ...context,
      knownFacts: {
        ...context.knownFacts,
        languageAbility: ability
      }
    });
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = resume.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...(resume.entities || {}),
      city: context.knownFacts?.city || resume.entities?.city || null,
      state: context.knownFacts?.state || null,
      coverage: context.knownFacts?.coverage || resume.entities?.coverage || null,
      preferredMeetingType: context.knownFacts?.preferredMeetingType || null,
      languageAbility: ability
    };
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.contextPatch = {
      knownFacts: {
        languageAbility: ability
      },
      conversation: {
        lastQuestionAsked: resume.lastQuestionAsked,
        lastProspectIntent: INTENTS.PROVIDE_LANGUAGE_ABILITY,
        clarificationCount: 0,
        pendingClarification: null
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_NAME) {
    const resume = resolveQualificationResume({
      ...context,
      knownFacts: {
        ...context.knownFacts,
        fullName: interpretation.entities?.name || context.knownFacts?.fullName || null,
        name: interpretation.entities?.name || context.knownFacts?.name || null
      }
    });
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = resume.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...(resume.entities || {})
    };
    structured.contextPatch = {
      knownFacts: {
        name: interpretation.entities?.name || null,
        fullName: interpretation.entities?.name || null
      },
      conversation: {
        lastQuestionAsked: resume.lastQuestionAsked
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_EMAIL) {
    const resume = resolveQualificationResume(context);
    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.customerReplyPlan.templateKey = resume.templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      ...(resume.entities || {})
    };
    structured.contextPatch = {
      knownFacts: {
        email: interpretation.entities?.email || null
      },
      conversation: {
        lastQuestionAsked: resume.lastQuestionAsked
      }
    };
    return structured;
  }

  if (intent === INTENTS.SSN_PRIVACY_OBJECTION) {
    const merged = mergeWorkAuthFacts(context, interpretation);
    const workAuthResolved =
      merged.workAuthorization === true ||
      merged.workAuthorization === false ||
      merged.workAuthorizationStatus === WORK_AUTHORIZATION.AUTHORIZED ||
      merged.workAuthorizationStatus === WORK_AUTHORIZATION.NOT_AUTHORIZED;
    const meetingType = interpretation.entities?.appointmentType || null;
    const resume = resolveQualificationResume({
      ...context,
      knownFacts: merged
    });

    structured.decision.nextAction = NEXT_ACTIONS.CONTINUE_QUALIFICATION;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.reasonCodes.push(REASON_CODES.PENDING_QUESTION_DEFERRED);
    if (workAuthResolved) {
      structured.reasonCodes.push(REASON_CODES.AUTHORIZATION_CAPTURED);
    }

    let templateKey = "ssn_privacy_reassure";
    if (meetingType === "in_person" && workAuthResolved) {
      templateKey = "ssn_privacy_reassure_in_person_then_day_part";
    } else if (meetingType === "in_person") {
      templateKey = "ssn_privacy_reassure_in_person";
    } else if (workAuthResolved) {
      templateKey = "ssn_privacy_reassure_then_day_part";
    }
    structured.customerReplyPlan.templateKey = templateKey;
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      preferredMeetingType: meetingType,
      city: merged.city || null
    };

    structured.contextPatch = {
      knownFacts: {
        ...(merged.workAuthorization === true || merged.workAuthorization === false
          ? {
              workAuthorization: merged.workAuthorization,
              workAuthorizationStatus: merged.workAuthorizationStatus
            }
          : {}),
        ...(meetingType
          ? {
              preferredMeetingType: meetingType,
              meetingPreferenceSource: "prospect",
              meetingTypeRequested: meetingType,
              meetingTypeConfirmed: true
            }
          : {})
      },
      ...(meetingType ? { appointment: { meetingType } } : {}),
      conversation: {
        lastProspectIntent: intent,
        lastQuestionAsked: workAuthResolved
          ? resume.lastQuestionAsked
          : context.conversation?.lastQuestionAsked || "ask_authorization",
        clarificationCount: 0,
        pendingClarification: null,
        confirmedFields: workAuthResolved
          ? Array.from(
              new Set([
                ...(context.conversation?.confirmedFields || []),
                "workAuthorization"
              ])
            )
          : context.conversation?.confirmedFields
      }
    };
    return structured;
  }

  if (intent === INTENTS.PROVIDE_MEETING_PREFERENCE) {
    const meetingType = interpretation.entities?.appointmentType || null;
    const merged = mergeWorkAuthFacts(context, interpretation);
    const workAuth = String(merged.workAuthorizationStatus || "").toLowerCase();
    const workAuthResolved =
      merged.workAuthorization === true ||
      merged.workAuthorization === false ||
      workAuth === "authorized" ||
      workAuth === "not_authorized";
    const resume = resolvePendingResume(context);
    const coverageFact = String(context.knownFacts?.coverage || "").toUpperCase();
    const hasLocation = Boolean(
      context.knownFacts?.city && context.knownFacts?.state
    );
    const coverageEval = hasLocation
      ? evaluateCoverage(
          coverageInputFromContext(context, {
            city: context.knownFacts.city,
            state: context.knownFacts.state
          })
        )
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
          preferredMeetingType: "in_person",
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
        ...(merged.workAuthorization === true || merged.workAuthorization === false
          ? {
              workAuthorization: merged.workAuthorization,
              workAuthorizationStatus: merged.workAuthorizationStatus
            }
          : {}),
        preferredMeetingType: meetingType,
        meetingPreferenceSource: "prospect",
        meetingTypeRequested: meetingType,
        meetingTypeConfirmed: true
        // availabilityConstraint intentionally untouched
      },
      appointment: {
        meetingType,
        location:
          meetingType === "zoom"
            ? null
            : context.appointment?.location ||
              extractOfficeCity(context.officeAddress) ||
              "office"
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
        location: extractOfficeCity(context.officeAddress) || "office"
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

    const pendingQ = String(context.conversation?.lastQuestionAsked || "");
    const offeredSlots = context.appointment?.previouslyOfferedSlots || [];
    const requestsLater = Boolean(
      interpretation.entities?.requestsLaterAlternatives
    );

    // Implements BR-119 — day-only narrowing against previously offered slots.
    // Do not re-query / broaden unless prospect asks for later alternatives.
    if (
      !requestsLater &&
      isPendingOfferedSlotChoice(pendingQ, offeredSlots) &&
      resolvedDate?.isoDate
    ) {
      const dayMatch = resolveUniqueOfferedDaySelection(
        offeredSlots,
        resolvedDate.isoDate
      );
      if (dayMatch.kind === "unique" && dayMatch.selected) {
        return applySelectedOfferedSlotDecision(
          structured,
          dayMatch.selected,
          offeredSlots,
          {
            reasonCodes: [REASON_CODES.OFFERED_SLOT_DAY_NARROWED],
            context
          }
        );
      }
      if (dayMatch.kind === "ambiguous") {
        // Same-day no-op: all offered slots already share this date → ask time only.
        if (isOfferedSetAlreadySameDay(offeredSlots, resolvedDate.isoDate)) {
          return applyAskWhichOfferedTime(structured, dayMatch.matches, {
            interpretation,
            dateIso: resolvedDate.isoDate,
            reasonCodes: [REASON_CODES.OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS]
          });
        }
        return applyRestateNarrowedOfferedSlots(structured, dayMatch.matches, {
          interpretation,
          dateIso: resolvedDate.isoDate,
          reasonCodes: [REASON_CODES.OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS]
        });
      }
    }

    if (requestsLater) {
      structured.reasonCodes.push(REASON_CODES.REQUESTED_LATER_ALTERNATIVES);
    }

    if (priorTime && !requestsLater) {
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

    // Implements BR-107 — with concrete date + prior constraint, offer real slots when read succeeds.
    // Implements BR-119 Case D — "más tarde" falls through here to query alternatives.
    const dateConstraintPatch = {
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
      }
    };
    const offeredFromDate = tryApplyAvailabilityOffer({
      structured,
      context,
      interpretation,
      availability,
      constraintPatch: dateConstraintPatch
    });
    if (offeredFromDate) {
      return offeredFromDate;
    }
    if (
      !context.appointment?.proposedDate &&
      !resolvedDate?.isoDate
    ) {
      structured.reasonCodes.push(REASON_CODES.AVAILABILITY_REQUIRES_CONCRETE_DATE);
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
    const mergedConstraint = mergeSchedulingConstraints(
      prior,
      constraint,
      context,
      interpretation
    );
    // Implements BR-117 — "tienes razón / me dijiste" only on genuine reassertion signals.
    // Matching prior.earliestTime alone is NOT correction language (stale durable context).
    const genuineRepetition = Boolean(interpretation.entities?.repetitionSignal);
    structured.decision.nextAction =
      NEXT_ACTIONS.ACKNOWLEDGE_AVAILABILITY_CONSTRAINT;
    structured.decision.shouldEscalate = false;
    structured.customerReplyPlan.acknowledgeRequest = true;

    const proposedTime = context.appointment?.proposedTime || null;
    const hasConcreteDate = Boolean(context.appointment?.proposedDate);
    const dateLabel = resolveDateLabel(
      context,
      structured.preferredLanguage || "spanish"
    );
    // Confirmable only when both wall-clock and a concrete day label/date exist.
    const confirmableSlot = Boolean(proposedTime && (hasConcreteDate || dateLabel));

    // Implements BR-107 / BR-108 / BR-117 — first-time (and non-confirmable stale
    // proposedTime) may offer real slots same turn; do not treat ghost time-only as locked.
    if (!confirmableSlot || !genuineRepetition) {
      const offeredFromConstraint = tryApplyAvailabilityOffer({
        structured,
        context,
        interpretation,
        availability,
        constraintPatch: {
          knownFacts: {
            availabilityConstraint: mergedConstraint,
            preferredDayPart:
              context.knownFacts?.preferredDayPart ||
              mergedConstraint?.dayPart ||
              prior?.dayPart ||
              null
          }
        }
      });
      if (offeredFromConstraint) {
        structured.reasonCodes.push(REASON_CODES.AVAILABILITY_CONSTRAINT_CAPTURED);
        return offeredFromConstraint;
      }
    }
    if (!hasConcreteDate && !availability) {
      // No read attempted / unavailable injection — legacy date-needed signal only when unread.
      structured.reasonCodes.push(REASON_CODES.AVAILABILITY_REQUIRES_CONCRETE_DATE);
    }

    if (genuineRepetition) {
      structured.customerReplyPlan.templateKey = confirmableSlot
        ? "acknowledge_known_availability_confirm_slot"
        : proposedTime
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
      earliestTime: mergedConstraint?.earliestTime || prior?.earliestTime || null,
      dayPart: mergedConstraint?.dayPart || prior?.dayPart || null,
      // Only surface proposedTime for confirm when day is known — else renderer stays neutral.
      requestedTime: confirmableSlot || genuineRepetition ? proposedTime : null,
      dateLabel: confirmableSlot ? dateLabel : null
    };
    structured.contextPatch = {
      knownFacts: {
        availabilityConstraint: mergedConstraint,
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
        // Without concrete date, BR-105 ask-time remains; date resolution continues separately.
        lastQuestionAsked:
          confirmableSlot && genuineRepetition
            ? "confirm_slot"
            : "ask_time_preference"
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
    const pendingQ = String(context.conversation?.lastQuestionAsked || "");
    const offeredSlots = context.appointment?.previouslyOfferedSlots || [];

    // Implements BR-119 — day-part against an active offered menu narrows first.
    if (isPendingOfferedSlotChoice(pendingQ, offeredSlots) && dayPart) {
      const dayPartMatches = filterOfferedSlotsByDayPart(offeredSlots, dayPart);
      if (dayPartMatches.length === 1) {
        return applySelectedOfferedSlotDecision(
          structured,
          dayPartMatches[0],
          offeredSlots,
          {
            reasonCodes: [
              REASON_CODES.DAY_PART_ADVANCES_TO_TIME,
              REASON_CODES.OFFERED_SLOT_NATURAL_TIME_SELECTED
            ],
            context
          }
        );
      }
      if (dayPartMatches.length > 1) {
        return applyRestateNarrowedOfferedSlots(structured, dayPartMatches, {
          interpretation,
          reasonCodes: [
            REASON_CODES.DAY_PART_ADVANCES_TO_TIME,
            REASON_CODES.OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS
          ]
        });
      }
    }

    // Implements BR-119 — when canonical availability is present, offer 1–2 real slots.
    const dayPartConstraintPatch = {
      knownFacts: {
        preferredDayPart: dayPart,
        availabilityConstraint: {
          type: "availability_constraint",
          dayPart,
          earliestTime: null,
          latestTime: null,
          earliestTimeInclusive: true,
          raw: interpretation.entities?.rawText || null
        }
      },
      conversation: {
        lastProspectIntent: INTENTS.PROVIDE_DAY_PART
      },
      currentStage: STAGES.SCHEDULING
    };
    const offeredFromDayPart = tryApplyAvailabilityOffer({
      structured,
      context,
      interpretation,
      availability,
      constraintPatch: dayPartConstraintPatch
    });
    if (offeredFromDayPart) {
      structured.reasonCodes.push(REASON_CODES.DAY_PART_ADVANCES_TO_TIME);
      structured.reasonCodes.push(REASON_CODES.DAY_PART_OFFERED_AVAILABLE_SLOTS);
      structured.reasonCodes.push(REASON_CODES.NO_DEAD_END_CONTINUATION);
      return offeredFromDayPart;
    }

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
    if (
      intent === INTENTS.AMBIGUOUS_FRAGMENT &&
      applyFirstTurnWhenNoPriorAtlasQuestion(structured, context, interpretation)
    ) {
      return structured;
    }
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
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        requiresHuman: true
      };
      structured.reasonCodes.push(REASON_CODES.REPEATED_AMBIGUITY_ESCALATE);
      structured.reasonCodes.push(REASON_CODES.ESCALATE_HANDOFF_CUSTOMER_ACK);
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
    const optionIndex = Number(interpretation.entities?.optionIndex) || 1;
    const selected =
      offered[Math.max(0, optionIndex - 1)] || offered[0] || null;
    return applySelectedOfferedSlotDecision(structured, selected, offered, {
      context
    });
  }

  if (intent === INTENTS.RESCHEDULE_REQUEST) {
    // Implements BR-171 — never create; load real interviewer slots when a day is given.
    structured.decision.mayCreateAppointment = false;
    structured.decision.mayRescheduleAppointment = false;
    const reschedulePatch = {
      appointment: {
        status: APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
        appointmentId: context.appointment?.appointmentId || null
      },
      currentStage: STAGES.RESCHEDULING
    };
    const offeredFromReschedule = tryApplyAvailabilityOffer({
      structured,
      context,
      interpretation,
      availability,
      constraintPatch: reschedulePatch
    });
    if (offeredFromReschedule) {
      offeredFromReschedule.decision.mayCreateAppointment = false;
      offeredFromReschedule.decision.mayRescheduleAppointment = false;
      offeredFromReschedule.contextPatch = {
        ...(offeredFromReschedule.contextPatch || {}),
        appointment: {
          ...(offeredFromReschedule.contextPatch?.appointment || {}),
          status: APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
          appointmentId: context.appointment?.appointmentId || null
        },
        currentStage: STAGES.RESCHEDULING
      };
      offeredFromReschedule.reasonCodes.push(REASON_CODES.RESCHEDULE_AFTER_CONFIRMATION);
      return offeredFromReschedule;
    }
    structured.decision.nextAction = NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW;
    structured.customerReplyPlan.acknowledgeRequest = true;
    structured.customerReplyPlan.templateKey = "offer_reschedule_flow";
    structured.reasonCodes.push(REASON_CODES.RESCHEDULE_AFTER_CONFIRMATION);
    structured.reasonCodes.push(REASON_CODES.APPOINTMENT_ALREADY_CONFIRMED);
    structured.contextPatch = reschedulePatch;
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

    // Implements BR-105 — reject times that violate earliest bound
    // (exclusive: after 5 + 5 → conflict; inclusive: a partir de 5 + 5 → ok).
    const availabilityConstraint =
      context.knownFacts?.availabilityConstraint || null;
    const earliestBound = availabilityConstraint?.earliestTime || null;
    if (
      requestedTime &&
      earliestBound &&
      violatesEarliestConstraint(requestedTime, availabilityConstraint)
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

    // Implements BR-115 — unique natural-time match against offered slots = selection.
    if (isPendingOfferedSlotChoice(pendingQ, offered) && requestedTime) {
      const dateIso =
        interpretation.entities?.resolvedDate?.isoDate ||
        interpretation.entities?.requestedDate?.isoDate ||
        null;
      const match = resolveUniqueOfferedSlotSelection(offered, requestedTime, {
        dateIso
      });
      if (match.kind === "unique" && match.selected) {
        return applySelectedOfferedSlotDecision(
          structured,
          match.selected,
          offered,
          {
            reasonCodes: [
              REASON_CODES.COUNTEROFFER_DETECTED,
              REASON_CODES.OFFERED_SLOT_NATURAL_TIME_SELECTED,
              REASON_CODES.SCHEDULING_HANDOFF_GUARD
            ],
            context
          }
        );
      }
      if (match.kind === "ambiguous") {
        structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
        structured.decision.shouldEscalate = false;
        structured.decision.mayCreateAppointment = false;
        structured.customerReplyPlan.acknowledgeRequest = true;
        structured.customerReplyPlan.templateKey = "clarify_offered_slot_day";
        structured.customerReplyPlan.entities = {
          ...structured.customerReplyPlan.entities,
          requestedTime,
          offeredSlots: match.matches
        };
        structured.reasonCodes.push(REASON_CODES.COUNTEROFFER_DETECTED);
        structured.reasonCodes.push(REASON_CODES.OFFERED_SLOT_TIME_AMBIGUOUS);
        structured.reasonCodes.push(REASON_CODES.RECOVERABLE_AMBIGUITY);
        structured.reasonCodes.push(REASON_CODES.SCHEDULING_HANDOFF_GUARD);
        structured.contextPatch = {
          appointment: {
            status: APPOINTMENT_STATUS.PROPOSED,
            previouslyOfferedSlots: offered
          },
          conversation: {
            lastQuestionAsked: "offer_time_choices",
            lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
            pendingClarification: "clarify_offered_slot_day",
            clarificationCount: 0
          },
          currentStage: STAGES.SCHEDULING,
          attention: { needsHumanAttention: false, reason: null }
        };
        return structured;
      }
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

    // Implements BR-116 — same-turn canonical availability offer after preferred time.
    // Prefer real Sprint 22 slots over the deferred "voy a revisar" ack.
    const preferencePatch = {
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
        lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
        pendingClarification: null
      }
    };
    if (
      availability?.checked &&
      !availability.providerFailure &&
      Array.isArray(availability.nearestAlternatives) &&
      availability.nearestAlternatives.length > 0
    ) {
      const offeredNow = tryApplyAvailabilityOffer({
        structured,
        context,
        interpretation,
        availability,
        constraintPatch: preferencePatch
      });
      if (offeredNow) {
        offeredNow.reasonCodes.push(REASON_CODES.COUNTEROFFER_DETECTED);
        offeredNow.reasonCodes.push(REASON_CODES.REQUESTED_TIME_AVAILABILITY_OFFERED);
        if (availability.requestedSlotAvailable === false) {
          offeredNow.reasonCodes.push(
            REASON_CODES.SLOT_UNAVAILABLE_OFFER_ALTERNATIVES
          );
        }
        // Keep user's preferred time even when alternatives are offered.
        // Implements BR-190 — exact requested time already asked SI
        // (confirm_slot). Do not relabel that as a multi-choice menu.
        const alreadyConfirmSlot =
          String(offeredNow.contextPatch?.conversation?.lastQuestionAsked || "") ===
          "confirm_slot";
        offeredNow.contextPatch = {
          ...offeredNow.contextPatch,
          appointment: {
            ...(offeredNow.contextPatch?.appointment || {}),
            proposedTime: requestedTime,
            proposedTimeHistory: history,
            previouslyOfferedSlots:
              offeredNow.contextPatch?.appointment?.previouslyOfferedSlots ||
              availability.nearestAlternatives
          },
          conversation: {
            ...(offeredNow.contextPatch?.conversation || {}),
            lastCounterofferTime: requestedTime,
            lastQuestionAsked: alreadyConfirmSlot
              ? "confirm_slot"
              : "offer_time_choices",
            lastProspectIntent: alreadyConfirmSlot
              ? offeredNow.contextPatch?.conversation?.lastProspectIntent ||
                INTENTS.SCHEDULING_COUNTEROFFER
              : INTENTS.SCHEDULING_COUNTEROFFER
          }
        };
        offeredNow.customerReplyPlan.entities = {
          ...offeredNow.customerReplyPlan.entities,
          requestedTime
        };
        return offeredNow;
      }
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

    // Provider hard failure may escalate after an active offered-slot negotiation.
    // BR-116 — first preferred-time reads without a prior menu fall through to the
    // deferred ack rather than forcing human escalate when agent/fixture is missing.
    if (availability?.providerFailure === true && offered.length > 0) {
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
    // BR-111 contract:
    // - nextAction / mayCreateAppointment = proposed desired action (not permission)
    // - executionAuthorized stays false here; SideEffectAuthorizer owns permission
    // - action performed is reported only by the executor after canonical success
    const offeredSlots = context.appointment?.previouslyOfferedSlots || [];
    const singleOffer = offeredSlots.length === 1 ? offeredSlots[0] : null;
    const confirmDate =
      context.appointment?.proposedDate ||
      singleOffer?.date ||
      singleOffer?.dateKey ||
      null;
    const confirmTime =
      context.appointment?.proposedTime ||
      singleOffer?.time ||
      singleOffer?.timeKey ||
      null;

    const recheck = availability?.confirmationRecheck || null;
    const lastQ = String(context.conversation?.lastQuestionAsked || "");
    const selected = selectedSlotFromContext(context);
    if (
      lastQ === "confirm_slot" &&
      selected &&
      recheck?.checked === true &&
      recheck.stillAvailable !== true
    ) {
      const replacements =
        Array.isArray(recheck.replacements) && recheck.replacements.length
          ? recheck.replacements
          : pickReplacementSlots(
              availability?.readResult?.slots ||
                availability?.offeredSlots ||
                availability?.nearestAlternatives ||
                [],
              selected
            );
      return applySelectedSlotNoLongerAvailable(structured, replacements, {
        context,
        interpretation
      });
    }

    const rescheduleExisting = isExistingAppointmentReschedule(context);
    structured.decision.nextAction = rescheduleExisting
      ? NEXT_ACTIONS.RESCHEDULE_APPOINTMENT
      : NEXT_ACTIONS.CREATE_APPOINTMENT;
    structured.decision.requiresExplicitConfirmation = true;
    structured.decision.mayCreateAppointment = !rescheduleExisting;
    structured.decision.mayRescheduleAppointment = rescheduleExisting;
    structured.decision.executionAuthorized = false;
    structured.decision.maySendOutbound = false;
    structured.decision.sideEffectsEnabled = false;
    structured.customerReplyPlan.templateKey = "appointment_confirm_deferred";
    structured.customerReplyPlan.entities = {
      ...structured.customerReplyPlan.entities,
      requestedDate: confirmDate,
      requestedTime: confirmTime
    };
    structured.reasonCodes.push(REASON_CODES.EXPLICIT_CONFIRMATION_RECEIVED);
    structured.reasonCodes.push(
      rescheduleExisting
        ? REASON_CODES.APPOINTMENT_RESCHEDULE_PROPOSED
        : REASON_CODES.APPOINTMENT_CREATE_PROPOSED
    );
    structured.contextPatch = {
      appointment: {
        status: rescheduleExisting
          ? APPOINTMENT_STATUS.RESCHEDULE_REQUESTED
          : APPOINTMENT_STATUS.PROPOSED,
        appointmentId: context.appointment?.appointmentId || null,
        proposedDate: confirmDate,
        proposedTime: confirmTime,
        previouslyOfferedSlots: offeredSlots
      },
      conversation: {
        lastQuestionAsked: "confirm_slot",
        lastProspectIntent: INTENTS.SCHEDULE_CONFIRM,
        // Implements BR-126 — deferred create must remain resumable.
        lastOfferMade: "appointment_confirm_deferred",
        pendingClarification: null,
        clarificationCount: 0
      },
      currentStage: STAGES.PROPOSED
    };
    return structured;
  }

  // Implements BR-102 — parseable state-only must never take a silent/escalate
  // terminal while city is still unresolved.
  if (intent === INTENTS.UNKNOWN || intent === INTENTS.AMBIGUOUS_FRAGMENT) {
    const inbound = inboundTextFromInterpretation(interpretation);
    const parsed = parseLocationAnswer(inbound);
    if (
      parsed?.completeness === "state_only" &&
      isCityUnresolvedForStateOnly(context)
    ) {
      return applyStateOnlyAskCity(
        structured,
        context,
        interpretation,
        parsed.state
      );
    }
  }

  // Recoverable unknown — clarify first; escalate only after repeats.
  // Never use human-handoff copy for ordinary mid-flow unknowns on first pass.
  // BR-131 — first-turn with no prior Atlas question cannot use resume/clarify_once.
  // BR-229 — FAQ / office / pending answers must not hit generic pending-data copy.
  if (interpretation.confidence < 0.5) {
    if (applyFirstTurnWhenNoPriorAtlasQuestion(structured, context, interpretation)) {
      return structured;
    }
    if (applyPendingContinuityInsteadOfClarify(structured, context, interpretation, availability)) {
      return structured;
    }
    structured.reasonCodes.push(REASON_CODES.RECOVERABLE_AMBIGUITY);
    const inboundText = inboundTextFromInterpretation(interpretation);
    const continuityBlocksHandoff =
      looksLikeOfficeLocationQuestion(inboundText) ||
      looksLikeNearbyLocationPreference(inboundText) ||
      looksLikeOfficeHoursQuestion(inboundText) ||
      looksLikeAvailableDaysQuestion(inboundText) ||
      looksLikeJobOpportunityQuestion(inboundText);
    if (shouldEscalateAfterClarifications(context) && !continuityBlocksHandoff) {
      structured.decision.nextAction = NEXT_ACTIONS.ESCALATE_TO_HUMAN;
      structured.decision.shouldEscalate = true;
      structured.customerReplyPlan.templateKey = "safe_uncertain_escalate";
      structured.customerReplyPlan.entities = {
        ...structured.customerReplyPlan.entities,
        requiresHuman: true,
        organizationId: context.organizationId || null,
        organizationName: context.organizationName || null
      };
      structured.reasonCodes.push(REASON_CODES.LOW_CONFIDENCE);
      structured.reasonCodes.push(REASON_CODES.REPEATED_AMBIGUITY_ESCALATE);
      structured.reasonCodes.push(REASON_CODES.ESCALATE_HANDOFF_CUSTOMER_ACK);
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
    if (continuityBlocksHandoff) {
      structured.reasonCodes.push(REASON_CODES.PREMATURE_HANDOFF);
    }

    if (!looksLikeClarifiableNonresponsiveInput(inboundText)) {
      const resume = resolvePendingResume(context);
      structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
      structured.decision.shouldEscalate = false;
      structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
      structured.customerReplyPlan.templateKey =
        resume.templateKey || "explain_pending_day_part";
      structured.contextPatch = {
        conversation: {
          lastQuestionAsked: resume.lastQuestionAsked || context.conversation?.lastQuestionAsked,
          lastProspectIntent: intent
        }
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

  if (applyFirstTurnWhenNoPriorAtlasQuestion(structured, context, interpretation)) {
    return structured;
  }
  if (applyPendingContinuityInsteadOfClarify(structured, context, interpretation, availability)) {
    return structured;
  }

  const inboundText = inboundTextFromInterpretation(interpretation);
  if (!looksLikeClarifiableNonresponsiveInput(inboundText)) {
    const resume = resolvePendingResume(context);
    structured.decision.nextAction = NEXT_ACTIONS.CLARIFY_ONCE;
    structured.decision.shouldEscalate = false;
    structured.reasonCodes.push(REASON_CODES.HANDOFF_GUARD_SKIPPED);
    structured.customerReplyPlan.templateKey =
      resume.templateKey || "explain_pending_day_part";
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
  structured.customerReplyPlan.entities = {
    ...structured.customerReplyPlan.entities,
    requiresHuman: true
  };
  structured.reasonCodes.push(REASON_CODES.FORBID_INTERNAL_DIAGNOSTICS);
  structured.reasonCodes.push(REASON_CODES.ESCALATE_HANDOFF_CUSTOMER_ACK);
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
  return ensureExplicitOutboundDecision(structured);
}

function decideConversationTurn(args = {}) {
  return ensureExplicitOutboundDecision(decideConversationTurnCore(args));
}

module.exports = {
  decideConversationTurn,
  decideSafeFailure,
  buildBaseDecision,
  resolveQualificationResume,
  resolveMeetingModalityForLocation,
  isExistingAppointmentReschedule
};
