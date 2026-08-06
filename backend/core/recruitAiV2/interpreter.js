/**
 * Recruit AI v2 — structured interpretation.
 * Reuses scheduleLanguageParser for time entities; does not book or send.
 * Implements BR-081.
 */

const {
  parseScheduleRequest,
  isConversationalScheduleFlexibilityEnabled
} = require("../scheduleLanguageParser");
const { INTENTS, LANGUAGES } = require("./constants");
const {
  normalizeLanguage,
  APPOINTMENT_STATUS
} = require("./conversationContext");

function detectMessageLanguageHint(text) {
  const sample = String(text || "").toLowerCase();
  if (!sample.trim()) {
    return LANGUAGES.UNKNOWN;
  }

  // Short numeric counteroffers carry no language signal.
  if (/^[\d:?\s.apm]+$/i.test(sample.trim())) {
    return LANGUAGES.UNKNOWN;
  }

  const spanishHints =
    /\b(hola|gracias|entrevista|mañana|lunes|quiero|prefiero|sí|si)\b/;
  if (spanishHints.test(sample)) {
    return LANGUAGES.SPANISH;
  }

  return LANGUAGES.ENGLISH;
}

function formatTimeEntity(schedule) {
  if (!schedule) {
    return null;
  }

  const hour =
    schedule.normalizedHour != null ? Number(schedule.normalizedHour) : Number(schedule.hour);
  const minute = Number(schedule.minute || 0);
  if (!Number.isFinite(hour)) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isAffirmative(text) {
  return /^(ok|okay|yes|yep|yeah|sure|sounds good|that works|perfect|si|sí)\b/i.test(
    String(text || "").trim()
  );
}

function isOptionSelection(text) {
  return /^[1-9]$/.test(String(text || "").trim());
}

function isEchoOfLastQuestion(text, context) {
  const last = String(context?.conversation?.lastAtlasOutboundText || "")
    .trim()
    .toLowerCase();
  const inbound = String(text || "")
    .trim()
    .toLowerCase();
  if (!last || !inbound) {
    return false;
  }

  return last.includes(inbound) || inbound === last;
}

function looksLikeOpportunityQuestion(text) {
  return /\b(opportunity|what.*(about|is).*(job|role|position)|tell me more)\b/i.test(
    String(text || "")
  );
}

function looksLikeName(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length > 60) {
    return false;
  }

  if (/\d/.test(trimmed)) {
    return false;
  }

  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ.'\-\s]+$/.test(trimmed) && trimmed.split(/\s+/).length >= 2;
}

function looksLikeLocation(text) {
  return /\b([A-Za-z .]+)\s*,?\s*(FL|Florida|NY|CA|TX|GA|NJ)\b/i.test(String(text || ""));
}

/**
 * Interpret one inbound message against canonical context.
 */
function interpretInboundMessage({ message, context, options = {} } = {}) {
  const text = String(message?.text || message || "").trim();
  const flexible =
    options.flexible !== undefined
      ? Boolean(options.flexible)
      : isConversationalScheduleFlexibilityEnabled();

  const appointmentStatus = context?.appointment?.status || APPOINTMENT_STATUS.NONE;
  const schedulingPhase =
    appointmentStatus === APPOINTMENT_STATUS.PROPOSED ||
    appointmentStatus === APPOINTMENT_STATUS.CONFIRMED ||
    appointmentStatus === APPOINTMENT_STATUS.RESCHEDULE_REQUESTED ||
    context?.currentStage === "scheduling" ||
    context?.currentStage === "proposed" ||
    context?.currentStage === "confirmed" ||
    context?.currentStage === "rescheduling"
      ? "OVERRIDE"
      : undefined;

  const schedule = parseScheduleRequest(text, {
    flexible,
    phase: schedulingPhase
  });
  const requestedTime = formatTimeEntity(schedule);
  const hasTimeEntity = Boolean(requestedTime);

  const messageLanguage = detectMessageLanguageHint(text);
  const preferredLanguage = normalizeLanguage(
    context?.preferredLanguage || LANGUAGES.UNKNOWN
  );

  let intent = INTENTS.UNKNOWN;
  let confidence = 0.4;
  const entities = {
    requestedDate: schedule?.dayHint || null,
    requestedTime: requestedTime,
    appointmentType: null,
    optionIndex: isOptionSelection(text) ? Number(text.trim()) : null,
    rawText: text
  };

  const isConfirmed = appointmentStatus === APPOINTMENT_STATUS.CONFIRMED;

  if (isEchoOfLastQuestion(text, context)) {
    intent = INTENTS.ECHO_OR_NOOP;
    confidence = 0.9;
  } else if (looksLikeOpportunityQuestion(text)) {
    intent = INTENTS.OPPORTUNITY_QUESTION;
    confidence = 0.85;
  } else if (isConfirmed && hasTimeEntity) {
    intent = INTENTS.RESCHEDULE_REQUEST;
    confidence = 0.9;
  } else if (hasTimeEntity) {
    intent = INTENTS.SCHEDULING_COUNTEROFFER;
    confidence = flexible ? 0.94 : 0.7;
  } else if (
    isAffirmative(text) &&
    (appointmentStatus === APPOINTMENT_STATUS.PROPOSED ||
      context?.conversation?.lastQuestionAsked === "confirm_slot")
  ) {
    intent = INTENTS.SCHEDULE_CONFIRM;
    confidence = 0.88;
  } else if (isOptionSelection(text)) {
    intent = INTENTS.SELECT_OPTION;
    confidence = 0.86;
  } else if (looksLikeLocation(text) && !context?.knownFacts?.city) {
    intent = INTENTS.PROVIDE_LOCATION;
    confidence = 0.8;
  } else if (looksLikeName(text) && !context?.knownFacts?.fullName) {
    intent = INTENTS.PROVIDE_NAME;
    confidence = 0.78;
  } else if (isAffirmative(text)) {
    intent = INTENTS.SCHEDULE_CONFIRM;
    confidence = 0.55;
  }

  return {
    intent,
    confidence,
    entities,
    messageLanguage,
    preferredLanguage:
      preferredLanguage === LANGUAGES.UNKNOWN && messageLanguage !== LANGUAGES.UNKNOWN
        ? messageLanguage
        : preferredLanguage === LANGUAGES.UNKNOWN
          ? LANGUAGES.ENGLISH
          : preferredLanguage,
    flexibleParsing: flexible,
    scheduleParse: schedule || null
  };
}

module.exports = {
  interpretInboundMessage,
  detectMessageLanguageHint,
  formatTimeEntity,
  isAffirmative,
  isOptionSelection,
  isEchoOfLastQuestion
};
