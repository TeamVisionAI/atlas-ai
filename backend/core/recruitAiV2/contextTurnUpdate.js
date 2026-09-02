/**
 * Recruit AI v2 — shared context advancement for a single inbound turn.
 * Used by continuous capture (lightweight) and shadow evaluation (full).
 * Implements BR-081 Phase 3B / BR-082: exactly-once durable context per inbound_message_id.
 */

const { interpretInboundMessage } = require("./interpreter");
const { decideConversationTurn, decideSafeFailure } = require("./decisionEngine");
const { mergeConversationContext } = require("./conversationContext");
const { loadConversationContext } = require("./contextLoader");
const { FACT_CERTAINTY, canonicalizeCityName, isStateNameNotCity } = require("./locationFacts");
const { shouldBlockLocationOverwrite } = require("./factCertainty");

/**
 * Apply interpretation + decision patches to context without rendering copy.
 */
function buildNextContextFromInterpretation({
  loaded,
  interpretation,
  structuredDecision
}) {
  const rawPatch = structuredDecision.contextPatch || {};
  let safePatch = rawPatch;

  // Confirmed location must not be overwritten by a weaker decisionEngine contextPatch.
  if (
    shouldBlockLocationOverwrite(loaded.knownFacts || {}, interpretation) &&
    rawPatch.knownFacts
  ) {
    const {
      city: _c,
      state: _s,
      cityCertainty: _cc,
      stateCertainty: _sc,
      proposedState: _ps,
      ...nonLocationFacts
    } = rawPatch.knownFacts;
    safePatch = {
      ...rawPatch,
      knownFacts: {
        ...nonLocationFacts,
        city: loaded.knownFacts.city,
        state: loaded.knownFacts.state,
        cityCertainty: loaded.knownFacts.cityCertainty,
        stateCertainty: loaded.knownFacts.stateCertainty,
        proposedState: loaded.knownFacts.proposedState ?? null
      }
    };
  }

  let nextContext = mergeConversationContext(loaded, safePatch);

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
    // Implements BR-105 — do not store times that conflict with earliestTime.
    const reasonCodes = structuredDecision?.reasonCodes || [];
    const constraintConflict = reasonCodes.includes(
      "AVAILABILITY_CONSTRAINT_CONFLICT"
    );
    if (!constraintConflict) {
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
    if (
      shouldBlockLocationOverwrite(nextContext.knownFacts || loaded.knownFacts || {}, interpretation)
    ) {
      // Keep confirmed canonical location; do not apply junk overwrite (e.g. "Me parece" → Parece, ME).
    } else {
    const completeness = interpretation.entities?.completeness;
    const rawCity =
      interpretation.entities?.city || nextContext.knownFacts?.city || null;
    const city =
      rawCity && !isStateNameNotCity(rawCity)
        ? canonicalizeCityName(rawCity) || rawCity
        : null;
    const state = interpretation.entities?.state || null;
    const proposedState =
      interpretation.entities?.proposedState ||
      (completeness === "partial"
        ? interpretation.entities?.proposedState
        : null);
    const priorState = nextContext.knownFacts?.state || loaded.knownFacts?.state || null;
    const priorStateCertainty = String(
      nextContext.knownFacts?.stateCertainty || loaded.knownFacts?.stateCertainty || ""
    ).toLowerCase();
    const retainState =
      Boolean(priorState) &&
      (priorStateCertainty === FACT_CERTAINTY.CONFIRMED ||
        priorStateCertainty === FACT_CERTAINTY.PARTIAL ||
        priorStateCertainty === "confirmed" ||
        priorStateCertainty === "partial");

    if (completeness === "complete" && city && state) {
      // Correction overwrites prior city; no competing active city fact.
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        city,
        state,
        zip: interpretation.entities?.zip || nextContext.knownFacts?.zip || null,
        cityCertainty: FACT_CERTAINTY.CONFIRMED,
        stateCertainty: FACT_CERTAINTY.CONFIRMED,
        proposedState: null
      };
    } else if (completeness === "state_only" && state && !city) {
      // Implements BR-102 — retain state-only partial; ask city next.
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        city: null,
        state,
        cityCertainty: FACT_CERTAINTY.UNKNOWN,
        stateCertainty: FACT_CERTAINTY.PARTIAL,
        proposedState: null
      };
    } else if (city && retainState) {
      // Implements BR-173 — later city merges with previously resolved state.
      nextContext.knownFacts = {
        ...nextContext.knownFacts,
        city,
        state: priorState,
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
  }

  if (interpretation.intent === "provide_email" && interpretation.entities?.email) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      email: interpretation.entities.email
    };
  }

  // provide_authorization, or same-turn auth captured beside job FAQ (pending compounds).
  if (interpretation.entities?.workAuthorization != null) {
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

  if (
    interpretation.intent === "provide_language_ability" &&
    interpretation.entities?.languageAbility
  ) {
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      languageAbility: interpretation.entities.languageAbility
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
    const { mergeSchedulingConstraints } = require("../sharedScheduling/schedulingNegotiationState");
    const merged = mergeSchedulingConstraints(
      nextContext.knownFacts?.availabilityConstraint || null,
      interpretation.entities.availabilityConstraint,
      nextContext,
      interpretation
    );
    // Implements BR-105 — keep confirmed day_part; do not overwrite afternoon→evening.
    nextContext.knownFacts = {
      ...nextContext.knownFacts,
      availabilityConstraint: merged,
      preferredDayPart:
        nextContext.knownFacts?.preferredDayPart ||
        merged?.dayPart ||
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
    // Implements BR-105 — skip conflicting times rejected by the decision engine.
    const reasonCodes = structuredDecision?.reasonCodes || [];
    if (!reasonCodes.includes("AVAILABILITY_CONSTRAINT_CONFLICT")) {
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
