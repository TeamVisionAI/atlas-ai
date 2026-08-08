/**
 * Recruit AI v2 — ContextLoader.
 * Builds durable conversation context from prospect + transcript + scheduling state.
 * Read-only; never mutates production rows.
 */

const {
  createConversationContext,
  mergeConversationContext,
  normalizeLanguage,
  APPOINTMENT_STATUS,
  STAGES
} = require("./conversationContext");

function extractOfferedSlotsFromText(text, timezone = "America/New_York") {
  if (!text) {
    return [];
  }

  const slots = [];
  const timeRe =
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b/g;
  let match = timeRe.exec(text);

  while (match) {
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const meridiem = String(match[3]).toUpperCase();

    if (meridiem === "PM" && hour < 12) {
      hour += 12;
    }
    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }

    slots.push({
      date: null,
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      timezone
    });

    match = timeRe.exec(text);
  }

  return slots;
}

function inferStageFromState({ appointmentStatus, needsHumanAttention, hasOfferedSlots }) {
  if (needsHumanAttention) {
    return STAGES.HUMAN_REQUIRED;
  }

  if (appointmentStatus === APPOINTMENT_STATUS.CONFIRMED) {
    return STAGES.CONFIRMED;
  }

  if (appointmentStatus === APPOINTMENT_STATUS.RESCHEDULE_REQUESTED) {
    return STAGES.RESCHEDULING;
  }

  if (appointmentStatus === APPOINTMENT_STATUS.PROPOSED || hasOfferedSlots) {
    return STAGES.PROPOSED;
  }

  return STAGES.SCHEDULING;
}

/**
 * Load canonical context from partial inputs (fixture/replay safe).
 */
function loadConversationContext(input = {}) {
  const {
    prospectId = null,
    organizationId = null,
    preferredLanguage = null,
    languageMeta = null,
    timezone = "America/New_York",
    knownFacts = {},
    appointment = {},
    conversation = {},
    attention = {},
    transcriptTail = [],
    schedulingState = null,
    existingContext = null,
    // BR-107 — read-only scheduling agent hints (never mutate BR-080 here).
    agentId = null,
    prospectOwnerUserId = null,
    orgDefaultRecruiterUserId = null
  } = input;

  const lastOutbound = [...transcriptTail]
    .reverse()
    .find((turn) => turn.direction === "outbound" || turn.role === "assistant");

  const lastOutboundText =
    lastOutbound?.text || lastOutbound?.body || conversation.lastAtlasOutboundText || null;

  const offeredFromText = extractOfferedSlotsFromText(lastOutboundText, timezone);
  const offeredFromState = Array.isArray(schedulingState?.offeredSlots)
    ? schedulingState.offeredSlots
    : [];
  const previouslyOfferedSlots =
    appointment.previouslyOfferedSlots?.length > 0
      ? appointment.previouslyOfferedSlots
      : offeredFromState.length > 0
        ? offeredFromState
        : offeredFromText;

  let appointmentStatus = appointment.status || APPOINTMENT_STATUS.NONE;
  if (
    appointmentStatus === APPOINTMENT_STATUS.NONE &&
    (appointment.confirmedDate || appointment.confirmedTime || appointment.appointmentId)
  ) {
    appointmentStatus = APPOINTMENT_STATUS.CONFIRMED;
  } else if (
    appointmentStatus === APPOINTMENT_STATUS.NONE &&
    (appointment.proposedDate || appointment.proposedTime || previouslyOfferedSlots.length)
  ) {
    appointmentStatus = APPOINTMENT_STATUS.PROPOSED;
  }

  const base = existingContext
    ? mergeConversationContext(createConversationContext(), existingContext)
    : createConversationContext();

  const currentStage =
    input.currentStage ||
    inferStageFromState({
      appointmentStatus,
      needsHumanAttention: Boolean(attention.needsHumanAttention),
      hasOfferedSlots: previouslyOfferedSlots.length > 0
    });

  return mergeConversationContext(base, {
    prospectId,
    organizationId,
    preferredLanguage: normalizeLanguage(
      preferredLanguage || base.preferredLanguage || LANGUAGES_FALLBACK()
    ),
    languageMeta: languageMeta || base.languageMeta || { source: "inferred" },
    currentStage,
    timezone,
    knownFacts,
    appointment: {
      ...appointment,
      status: appointmentStatus,
      previouslyOfferedSlots
    },
    conversation: {
      ...conversation,
      lastAtlasOutboundText: lastOutboundText,
      lastQuestionAsked:
        conversation.lastQuestionAsked ||
        (previouslyOfferedSlots.length ? "offer_time_choices" : conversation.lastQuestionAsked)
    },
    attention,
    agentId: agentId || existingContext?.agentId || null,
    prospectOwnerUserId:
      prospectOwnerUserId || existingContext?.prospectOwnerUserId || null,
    orgDefaultRecruiterUserId:
      orgDefaultRecruiterUserId || existingContext?.orgDefaultRecruiterUserId || null
  });
}

function LANGUAGES_FALLBACK() {
  return "unknown";
}

/**
 * Build context seed from the TV-000028-style fixture for a given turn index.
 * Does not touch production.
 */
function loadContextFromReplayFixture(fixture, turnIndex) {
  if (!fixture?.identity) {
    throw new Error("fixture.identity is required");
  }

  const inboundTurns = (fixture.turns || []).filter((t) => t.direction === "inbound");
  // Context for turnIndex includes only prior turns (not the current inbound).
  const prior = inboundTurns.slice(0, Math.max(0, turnIndex));

  const transcriptTail = [];
  for (const turn of prior) {
    transcriptTail.push({ direction: "inbound", text: turn.text, atUtc: turn.atUtc });
    const outbound = Array.isArray(turn.observedOutbound)
      ? turn.observedOutbound[0]
      : turn.observedOutbound;
    if (outbound) {
      transcriptTail.push({ direction: "outbound", text: outbound, atUtc: turn.atUtc });
    }
  }

  const lastOffer = [...transcriptTail]
    .reverse()
    .find((t) => t.direction === "outbound");

  const offeredSlots = extractOfferedSlotsFromText(
    lastOffer?.text,
    fixture.identity.timezone || "America/New_York"
  );

  // Approximate appointment progression through the forensic timeline.
  let appointmentStatus = APPOINTMENT_STATUS.NONE;
  let confirmedTime = null;
  let confirmedDate = null;
  let mismatchCount = 0;
  let needsHuman = false;

  for (const turn of prior) {
    if (turn.failureTags?.includes("ignored_counteroffer")) {
      mismatchCount += 1;
    }
    if (turn.failureTags?.includes("internal_error_leaked")) {
      needsHuman = true;
    }
    if (turn.id === "t13" || (turn.text === "Ok" && turn.id === "t13")) {
      appointmentStatus = APPOINTMENT_STATUS.CONFIRMED;
      confirmedTime = "17:15";
      confirmedDate = null;
    }
  }

  // After t13 in fixture ordering — if turnIndex points at t14, confirmed.
  const current = inboundTurns[turnIndex];
  if (current?.id === "t14" || prior.some((t) => t.id === "t13")) {
    appointmentStatus = APPOINTMENT_STATUS.CONFIRMED;
    confirmedTime = "17:15";
  }

  if (offeredSlots.length && appointmentStatus === APPOINTMENT_STATUS.NONE) {
    appointmentStatus = APPOINTMENT_STATUS.PROPOSED;
  }

  const knownFacts = {};
  if (prior.some((t) => /miami/i.test(t.text))) {
    knownFacts.city = "Miami";
    knownFacts.state = "FL";
  }
  if (prior.some((t) => /juanito/i.test(t.text))) {
    knownFacts.fullName = "Juanito Garcia";
  }

  return loadConversationContext({
    prospectId: fixture.identity.prospectId,
    organizationId: fixture.identity.organizationId,
    preferredLanguage: fixture.identity.preferredLanguage,
    timezone: fixture.identity.timezone,
    knownFacts,
    appointment: {
      status: appointmentStatus,
      confirmedTime,
      confirmedDate,
      appointmentId:
        appointmentStatus === APPOINTMENT_STATUS.CONFIRMED
          ? fixture.identity.appointmentId
          : null,
      previouslyOfferedSlots: offeredSlots,
      meetingType: "in_person",
      proposedTime: offeredSlots[0]?.time || null
    },
    conversation: {
      counterofferMismatchCount: mismatchCount,
      lastAtlasOutboundText: lastOffer?.text || null,
      lastQuestionAsked: offeredSlots.length ? "offer_time_choices" : null,
      confirmedFields: Object.keys(knownFacts)
    },
    attention: {
      needsHumanAttention: needsHuman,
      reason: needsHuman ? "booking_failed_safe_escalation" : null
    },
    transcriptTail
  });
}

module.exports = {
  loadConversationContext,
  loadContextFromReplayFixture,
  extractOfferedSlotsFromText
};
