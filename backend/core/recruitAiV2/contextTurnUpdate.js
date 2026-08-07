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
      workAuthorization: Boolean(interpretation.entities.workAuthorization),
      workAuthorizationStatus: Boolean(interpretation.entities.workAuthorization)
        ? "authorized"
        : "not_authorized"
    };
  }

  if (
    interpretation.intent === "ambiguous_license_statement" ||
    interpretation.intent === "provide_license_clarification"
  ) {
    const status = interpretation.entities?.financialLicenseStatus;
    const types = interpretation.entities?.financialLicenseTypes;
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      ...(status ? { financialLicenseStatus: status } : {}),
      ...(Array.isArray(types) ? { financialLicenseTypes: types } : {})
      // Intentionally do not touch workAuthorization here (BR-083).
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
    // BR-085 — do not silently apply in-person when travel confirmation is pending.
    const pendingTravel =
      String(nextContext.conversation?.pendingClarification || "") ===
        "confirm_in_person_travel" ||
      String(structuredDecision?.contextPatch?.conversation?.pendingClarification || "") ===
        "confirm_in_person_travel";
    if (
      interpretation.entities.appointmentType === "in_person" &&
      pendingTravel
    ) {
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        meetingTypeRequested: "in_person",
        meetingTypeConfirmed: false,
        meetingPreferenceSource: "prospect_requested"
      };
    } else {
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        preferredMeetingType: interpretation.entities.appointmentType,
        meetingTypeRequested: interpretation.entities.appointmentType,
        meetingTypeConfirmed: true,
        meetingPreferenceSource: "prospect"
      };
      nextContext.appointment = {
        ...nextContext.appointment,
        meetingType: interpretation.entities.appointmentType,
        location:
          interpretation.entities.appointmentType === "zoom"
            ? null
            : nextContext.appointment?.location
      };
    }
  }

  if (interpretation.intent === "confirm_in_person_travel") {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      preferredMeetingType: "in_person",
      meetingTypeRequested: "in_person",
      meetingTypeConfirmed: true,
      meetingPreferenceSource: "prospect_confirmed"
    };
    nextContext.appointment = {
      ...nextContext.appointment,
      meetingType: "in_person",
      location: "Doral office"
    };
  }

  if (
    interpretation.intent === "scheduling_date_proposal" &&
    interpretation.entities?.resolvedDate?.isoDate
  ) {
    const priorDate = nextContext.appointment?.proposedDate || null;
    const history = Array.isArray(nextContext.appointment?.proposedDateHistory)
      ? [...nextContext.appointment.proposedDateHistory]
      : [];
    if (priorDate && priorDate !== interpretation.entities.resolvedDate.isoDate) {
      history.push(priorDate);
    }
    nextContext.appointment = {
      ...nextContext.appointment,
      proposedDate: interpretation.entities.resolvedDate.isoDate,
      proposedDateHistory: history,
      proposedTime:
        interpretation.entities.priorProposedTime ||
        nextContext.appointment?.proposedTime ||
        null,
      status: nextContext.appointment?.status || "proposed"
    };
    if (Array.isArray(interpretation.entities.dateExclusions)) {
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        dateExclusions: interpretation.entities.dateExclusions
      };
    }
  }

  if (
    interpretation.intent === "provide_availability_constraint" &&
    interpretation.entities?.availabilityConstraint
  ) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      availabilityConstraint: interpretation.entities.availabilityConstraint,
      preferredDayPart:
        interpretation.entities.availabilityConstraint.dayPart ||
        nextContext.knownFacts?.preferredDayPart ||
        null
    };
  }

  if (
    interpretation.intent === "provide_day_part" &&
    interpretation.entities?.dayPart
  ) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      preferredDayPart: interpretation.entities.dayPart
    };
  }

  if (
    (interpretation.intent === "scheduling_counteroffer" ||
      interpretation.intent === "reschedule_request") &&
    interpretation.entities?.requestedTime
  ) {
    const prior = nextContext.appointment?.proposedTime || null;
    const history = Array.isArray(nextContext.appointment?.proposedTimeHistory)
      ? [...nextContext.appointment.proposedTimeHistory]
      : [];
    if (prior && prior !== interpretation.entities.requestedTime) {
      history.push(prior);
    }
    nextContext.appointment = {
      ...nextContext.appointment,
      proposedTime: interpretation.entities.requestedTime,
      proposedTimeHistory: history,
      status: nextContext.appointment?.status || "proposed"
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
