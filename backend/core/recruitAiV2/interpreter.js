/**
 * Recruit AI v2 — structured interpretation (BR-081 / BR-082).
 * Reuses scheduleLanguageParser for time entities; does not book or send.
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
const {
  parseLocationAnswer,
  normalizeStateToken,
  looksLikeLocationCorrection,
  proposeStateFromCity
} = require("./locationFacts");
const {
  parseLicenseStatement,
  parseWorkAuthorizationAnswer,
  looksLikeDriversLicense,
  looksLikeFinancialLicense,
  mentionsLicense,
  mentionsWorkAuthorization,
  toBooleanWorkAuthorization,
  FINANCIAL_LICENSE_STATUS
} = require("./qualificationFacts");
const { resolveConversationalLanguage } = require("./languagePolicy");

function detectMessageLanguageHint(text) {
  const sample = String(text || "").toLowerCase();
  if (!sample.trim()) {
    return LANGUAGES.UNKNOWN;
  }

  if (/^[\d:?\s.apm]+$/i.test(sample.trim())) {
    return LANGUAGES.UNKNOWN;
  }

  const spanishHints =
    /\b(hola|gracias|entrevista|mañana|manana|buenos|buenas|lunes|quiero|prefiero|sí|si|tarde|estado|ciudad|digo|vivo|permiso)\b/;
  if (spanishHints.test(sample)) {
    return LANGUAGES.SPANISH;
  }

  const englishHints =
    /\b(hello|hi|hey|thanks|morning|afternoon|evening|interview|prefer|what is this about|how does this work)\b/;
  if (englishHints.test(sample) || /^what\b.+\?$/.test(sample)) {
    return LANGUAGES.ENGLISH;
  }

  return LANGUAGES.UNKNOWN;
}

function formatTimeEntity(schedule) {
  if (!schedule) {
    return null;
  }

  const hour =
    schedule.normalizedHour != null
      ? Number(schedule.normalizedHour)
      : Number(schedule.hour);
  const minute = Number(schedule.minute || 0);
  if (!Number.isFinite(hour)) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isAffirmative(text) {
  // Normalize accents: JS \b treats í as non-word, so "sí\b" fails.
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.]+$/g, "");
  if (!t) {
    return false;
  }
  // Do not treat "sí tengo licencia/permiso…" as bare affirmation.
  if (mentionsLicense(t) || /\b(tengo|have|permiso|autoriz)/i.test(t)) {
    return false;
  }
  return /^(ok|okay|yes|yep|yeah|sure|sounds good|that works|perfect|si|claro|por supuesto)(\s|$)/i.test(
    t
  );
}

function isOptionSelection(text) {
  return /^[1-9]$/.test(String(text || "").trim());
}

function isGreeting(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.,]+$/g, "");
  if (!t) {
    return false;
  }
  return /^(hi|hello|hey|good morning|good afternoon|good evening|hola|buenos d[ií]as|buenas tardes|buenas noches|buenas)$/i.test(
    t
  );
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

  // Exact / near-exact echo only — do not treat short answers contained in
  // the outbound ("Florida" inside "¿Miami, Florida?") as echoes.
  if (inbound === last) {
    return true;
  }
  if (inbound.length >= 12 && last.includes(inbound)) {
    return true;
  }
  // Quoted full-question paste.
  if (inbound.length >= 20 && inbound.includes(last.slice(0, 20))) {
    return true;
  }
  return false;
}

function looksLikeOpportunityQuestion(text) {
  const t = String(text || "").trim();
  if (!t) {
    return false;
  }
  // Keep opportunity/about separate from insurance/license/compensation FAQs.
  return (
    /what is this about/i.test(t) ||
    /how does this work/i.test(t) ||
    /de qu[eé] se trata/i.test(t) ||
    /de qu[eé] trata/i.test(t) ||
    /\b(opportunity|tell me more|que es esto|qué es esto)\b/i.test(t) ||
    /what.*(about|is).*(job|role|position|opportunity)/i.test(t)
  );
}

function looksLikeInsuranceQuestion(text) {
  const t = String(text || "").trim();
  return (
    /is this insurance/i.test(t) ||
    /is it insurance/i.test(t) ||
    /es (esto )?seguro/i.test(t) ||
    /es para vender seguros/i.test(t) ||
    /\bseguros\b/i.test(t) && /\?/.test(t)
  );
}

function looksLikeLicenseRequirementQuestion(text) {
  const t = String(text || "").trim();
  return (
    /do i need a license/i.test(t) ||
    /need a license/i.test(t) ||
    /necesito (una )?licencia/i.test(t) ||
    /necesito una\??$/i.test(t) ||
    /do i need a 215/i.test(t) ||
    /hace falta licencia/i.test(t)
  );
}

function looksLikeCompensationQuestion(text) {
  const t = String(text || "").trim();
  return (
    /how much money do i make/i.test(t) ||
    /how much (do|can) i make/i.test(t) ||
    /how much does it pay/i.test(t) ||
    /what'?s the compensation/i.test(t) ||
    /is there a salary/i.test(t) ||
    /is it commission/i.test(t) ||
    /cu[aá]nto (pagan|se gana|gano)/i.test(t) ||
    /\b(salary|sueldo|salario|commission|comisi[oó]n)\b/i.test(t)
  );
}

function looksLikeWorkAuthorizationAnswer(text, context) {
  const status = parseWorkAuthorizationAnswer(text, context);
  return toBooleanWorkAuthorization(status);
}

function looksLikeExplicitLanguageSwitch(text) {
  const t = String(text || "").trim();
  if (!t) {
    return null;
  }
  if (
    /can we (continue|speak|talk) in english/i.test(t) ||
    /prefiero ingl[eé]s/i.test(t) ||
    /switch to english/i.test(t) ||
    /in english please/i.test(t)
  ) {
    return LANGUAGES.ENGLISH;
  }
  if (
    /can we (continue|speak|talk) in spanish/i.test(t) ||
    /prefiero espa[nñ]ol/i.test(t) ||
    /switch to spanish/i.test(t) ||
    /en espa[nñ]ol por favor/i.test(t)
  ) {
    return LANGUAGES.SPANISH;
  }
  return null;
}

function looksLikeZoomPreference(text) {
  return /\b(zoom|por zoom|video call|videocall|virtual|remote)\b/i.test(
    String(text || "")
  );
}

function looksLikeInPersonPreference(text) {
  return /\b(in[- ]?person|office|oficina|presencial|en persona)\b/i.test(
    String(text || "")
  );
}

function looksLikeCancelRequest(text) {
  return /\b(cancel|cancelar|no puedo ir|can'?t make it|cannot make it)\b/i.test(
    String(text || "")
  );
}

function looksLikeRescheduleRequest(text) {
  return /\b(reschedule|reprogram|change (the )?(time|appointment|it)|can we change|cambiar (la )?hora|podemos cambiar)\b/i.test(
    String(text || "")
  );
}

function lastQuestionImpliesDayPart(context) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "").toLowerCase();
  const lastOut = String(context?.conversation?.lastAtlasOutboundText || "").toLowerCase();
  if (
    lastQ.includes("day_part") ||
    lastQ.includes("daypart") ||
    lastQ.includes("ask_day_part")
  ) {
    return true;
  }
  return /mañana|manana|tarde|morning|afternoon|evening/.test(lastOut);
}

function lastQuestionImpliesLocation(context) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "").toLowerCase();
  const lastOut = String(context?.conversation?.lastAtlasOutboundText || "").toLowerCase();
  if (
    lastQ.includes("location") ||
    lastQ.includes("city") ||
    lastQ.includes("state") ||
    lastQ.includes("confirm_location")
  ) {
    return true;
  }
  return /ciudad|estado|city and state|which state|florida\?/.test(lastOut);
}

function parseDayPart(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    /^(morning|manana|por la manana|in the morning|1)$/.test(t) ||
    /\b(morning|por la manana)\b/.test(t)
  ) {
    return { dayPart: "morning", complete: true };
  }
  if (
    /^(afternoon|evening|tarde|por la tarde|in the afternoon|2)$/.test(t) ||
    /\b(afternoon|evening|por la tarde)\b/.test(t)
  ) {
    return { dayPart: "afternoon", complete: true };
  }

  // Incomplete / typo fragments toward day-part.
  if (
    /^(la or|la t|afte|mana|maña|manan|por la|later maybe|latr|tar)$/i.test(
      String(text || "").trim()
    ) ||
    /^(maña|manan|afte|tar)$/i.test(t)
  ) {
    return { dayPart: null, complete: false, incomplete: true };
  }

  return null;
}

function looksLikeAmbiguousFragment(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.length <= 2) {
    return true;
  }
  // Short alphabetic scraps / truncated phrases.
  if (trimmed.length <= 8 && /\s/.test(trimmed) && trimmed.split(/\s+/).length <= 2) {
    if (!parseDayPart(trimmed)?.complete && !isGreeting(trimmed)) {
      return true;
    }
  }
  if (
    /^(la or|la t|afte|maña|manan|por la|later maybe|ok\.\.\.|umm|uh)$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  return false;
}

function looksLikeName(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length > 60) {
    return false;
  }
  if (looksLikeAmbiguousFragment(trimmed)) {
    return false;
  }
  if (/\d/.test(trimmed)) {
    return false;
  }
  // Never treat authorization / location / FAQ phrasing as a name.
  if (
    /\b(permiso|autoriz|authorization|vivo|live in|digo|insurance|licen[cs]ia|about)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }
  if (isAffirmative(trimmed) || looksLikeOpportunityQuestion(trimmed)) {
    return false;
  }
  // Require at least first + last with each token length >= 2.
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return false;
  }
  if (parts.some((p) => p.length < 2)) {
    return false;
  }
  // Cap at two/three name tokens — longer phrases are answers, not names.
  if (parts.length > 3) {
    return false;
  }
  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ.'\-\s]+$/.test(trimmed);
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

  const scheduleText = String(text || "").replace(/[?]+$/g, "").trim();
  const schedule = parseScheduleRequest(scheduleText, {
    flexible,
    phase: schedulingPhase
  });
  const requestedTime = formatTimeEntity(schedule);
  const hasTimeEntity = Boolean(requestedTime);

  const messageLanguage = detectMessageLanguageHint(text);

  let intent = INTENTS.UNKNOWN;
  let confidence = 0.4;
  const entities = {
    requestedDate: schedule?.dayHint || null,
    requestedTime: requestedTime,
    appointmentType: null,
    optionIndex: isOptionSelection(text) ? Number(text.trim()) : null,
    rawText: text,
    city: null,
    state: null,
    proposedState: null,
    dayPart: null,
    completeness: null,
    requiresClarification: false,
    name: null
  };

  const isConfirmed = appointmentStatus === APPOINTMENT_STATUS.CONFIRMED;
  const dayPartCtx = lastQuestionImpliesDayPart(context);
  const locationCtx = lastQuestionImpliesLocation(context);
  const dayPartParse = parseDayPart(text);

  const languageSwitchTo = looksLikeExplicitLanguageSwitch(text);
  const authAnswer = looksLikeWorkAuthorizationAnswer(text, context);
  const licenseStatement = parseLicenseStatement(text);
  const pendingLicenseClarify =
    String(context?.conversation?.lastQuestionAsked || "") ===
    "clarify_license_type";

  if (isGreeting(text)) {
    intent = INTENTS.GREETING;
    confidence = 0.95;
  } else if (languageSwitchTo) {
    intent = INTENTS.REQUEST_LANGUAGE_SWITCH;
    confidence = 0.93;
    entities.requestedLanguage = languageSwitchTo;
  } else if (isEchoOfLastQuestion(text, context)) {
    intent = INTENTS.ECHO_OR_NOOP;
    confidence = 0.9;
  } else if (looksLikeCompensationQuestion(text)) {
    intent = INTENTS.COMPENSATION_QUESTION;
    confidence = 0.92;
  } else if (looksLikeInsuranceQuestion(text)) {
    intent = INTENTS.INSURANCE_QUESTION;
    confidence = 0.92;
  } else if (looksLikeLicenseRequirementQuestion(text)) {
    intent = INTENTS.LICENSE_REQUIREMENT_QUESTION;
    confidence = 0.92;
  } else if (looksLikeOpportunityQuestion(text)) {
    intent = INTENTS.OPPORTUNITY_QUESTION;
    confidence = 0.9;
  } else if (
    pendingLicenseClarify &&
    mentionsWorkAuthorization(text) &&
    !mentionsLicense(text)
  ) {
    // Work-auth answer during license clarify — capture auth only; keep license unclear.
    intent = INTENTS.PROVIDE_AUTHORIZATION;
    confidence = 0.9;
    entities.workAuthorization = authAnswer === true;
    entities.requiresClarification = false;
  } else if (pendingLicenseClarify && licenseStatement) {
    intent = INTENTS.PROVIDE_LICENSE_CLARIFICATION;
    confidence = 0.93;
    entities.financialLicenseStatus = licenseStatement.financialLicenseStatus;
    entities.financialLicenseTypes = licenseStatement.financialLicenseTypes;
    entities.driversLicense = Boolean(licenseStatement.driversLicense);
    entities.ambiguousLicense = Boolean(licenseStatement.ambiguous);
  } else if (
    pendingLicenseClarify &&
    (looksLikeDriversLicense(text) ||
      /^(de )?seguros/i.test(text) ||
      /de seguros no/i.test(text) ||
      /^(no|ninguna)/i.test(text.trim()))
  ) {
    intent = INTENTS.PROVIDE_LICENSE_CLARIFICATION;
    confidence = 0.9;
    if (looksLikeDriversLicense(text)) {
      entities.financialLicenseStatus = FINANCIAL_LICENSE_STATUS.NONE;
      entities.driversLicense = true;
    } else if (/^(no|ninguna)/i.test(text.trim()) || /de seguros no/i.test(text)) {
      entities.financialLicenseStatus = FINANCIAL_LICENSE_STATUS.NONE;
      entities.driversLicense = false;
    } else if (looksLikeFinancialLicense(text) || /seguros/i.test(text)) {
      entities.financialLicenseStatus = FINANCIAL_LICENSE_STATUS.LICENSED;
      entities.driversLicense = false;
    }
  } else if (
    /de seguros no/i.test(text) ||
    /\bno (tengo )?(licencia )?(de )?seguros\b/i.test(text)
  ) {
    intent = INTENTS.PROVIDE_LICENSE_CLARIFICATION;
    confidence = 0.88;
    entities.financialLicenseStatus = FINANCIAL_LICENSE_STATUS.NONE;
    entities.driversLicense = false;
    entities.ambiguousLicense = false;
  } else if (
    licenseStatement &&
    (String(context?.conversation?.lastQuestionAsked || "") ===
      "ask_authorization" ||
      licenseStatement.ambiguous ||
      mentionsLicense(text))
  ) {
    // Generic/explicit license statements never satisfy work authorization.
    if (licenseStatement.ambiguous || !licenseStatement.driversLicense) {
      intent = licenseStatement.ambiguous
        ? INTENTS.AMBIGUOUS_LICENSE_STATEMENT
        : INTENTS.PROVIDE_LICENSE_CLARIFICATION;
      confidence = 0.9;
      entities.financialLicenseStatus = licenseStatement.financialLicenseStatus;
      entities.financialLicenseTypes = licenseStatement.financialLicenseTypes;
      entities.driversLicense = Boolean(licenseStatement.driversLicense);
      entities.ambiguousLicense = Boolean(licenseStatement.ambiguous);
      entities.requiresClarification = Boolean(licenseStatement.ambiguous);
    }
  } else if (authAnswer !== null) {
    intent = INTENTS.PROVIDE_AUTHORIZATION;
    confidence = 0.92;
    entities.workAuthorization = authAnswer;
    entities.requiresClarification = false;
  } else if (looksLikeCancelRequest(text) && isConfirmed) {
    intent = INTENTS.CANCEL_REQUEST;
    confidence = 0.88;
  } else if (
    looksLikeRescheduleRequest(text) ||
    (isConfirmed && looksLikeRescheduleRequest(text))
  ) {
    intent = INTENTS.RESCHEDULE_REQUEST;
    confidence = 0.88;
  } else if (looksLikeZoomPreference(text)) {
    intent = INTENTS.PROVIDE_MEETING_PREFERENCE;
    confidence = 0.9;
    entities.appointmentType = "zoom";
  } else if (looksLikeInPersonPreference(text)) {
    intent = INTENTS.PROVIDE_MEETING_PREFERENCE;
    confidence = 0.9;
    entities.appointmentType = "in_person";
  } else if (dayPartCtx && dayPartParse?.complete) {
    intent = INTENTS.PROVIDE_DAY_PART;
    confidence = 0.9;
    entities.dayPart = dayPartParse.dayPart;
    entities.completeness = "complete";
  } else if (dayPartCtx && (dayPartParse?.incomplete || looksLikeAmbiguousFragment(text))) {
    intent = INTENTS.INCOMPLETE_DAY_PART;
    confidence = 0.82;
    entities.requiresClarification = true;
    entities.completeness = "partial";
  } else if (dayPartParse?.complete && !locationCtx) {
    intent = INTENTS.PROVIDE_DAY_PART;
    confidence = 0.88;
    entities.dayPart = dayPartParse.dayPart;
    entities.completeness = "complete";
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
  } else if (
    isAffirmative(text) &&
    (context?.conversation?.lastQuestionAsked === "confirm_location" ||
      context?.knownFacts?.proposedState)
  ) {
    intent = INTENTS.PROVIDE_LOCATION;
    confidence = 0.9;
    entities.city = context?.knownFacts?.city || null;
    entities.state = context?.knownFacts?.proposedState || null;
    entities.completeness = "complete";
    entities.requiresClarification = false;
  } else if (isOptionSelection(text)) {
    intent = INTENTS.SELECT_OPTION;
    confidence = 0.86;
  } else if (looksLikeAmbiguousFragment(text) && !normalizeStateToken(text)) {
    // Fragments must not become names or city-only locations (BR-082).
    intent = dayPartCtx ? INTENTS.INCOMPLETE_DAY_PART : INTENTS.AMBIGUOUS_FRAGMENT;
    confidence = 0.75;
    entities.requiresClarification = true;
    entities.completeness = "partial";
  } else {
    const location = parseLocationAnswer(text);
    const awaitingState =
      locationCtx &&
      context?.knownFacts?.city &&
      (!context?.knownFacts?.state ||
        context?.knownFacts?.stateCertainty === "partial" ||
        context?.knownFacts?.stateCertainty === "proposed" ||
        context?.knownFacts?.stateCertainty === "unknown");
    const isCorrection =
      Boolean(location?.correction) || looksLikeLocationCorrection(text);

    if (location?.completeness === "state_only" && (awaitingState || context?.knownFacts?.city)) {
      intent = INTENTS.PROVIDE_LOCATION;
      confidence = 0.9;
      entities.city = context?.knownFacts?.city || null;
      entities.state = location.state;
      entities.completeness = "complete";
      entities.requiresClarification = false;
    } else if (location?.completeness === "complete") {
      intent = isCorrection ? INTENTS.CORRECT_LOCATION : INTENTS.PROVIDE_LOCATION;
      confidence = 0.9;
      entities.city = location.city;
      entities.state = location.state;
      entities.completeness = "complete";
      entities.requiresClarification = false;
      entities.correction = isCorrection;
    } else if (location?.completeness === "partial") {
      // Correction of city while state already confirmed + geographically compatible.
      const priorState = context?.knownFacts?.state || null;
      const priorStateOk =
        context?.knownFacts?.stateCertainty === "confirmed" && priorState;
      const proposed = location.proposedState || proposeStateFromCity(location.city);
      if (isCorrection && priorStateOk && proposed && proposed === priorState) {
        intent = INTENTS.CORRECT_LOCATION;
        confidence = 0.9;
        entities.city = location.city;
        entities.state = priorState;
        entities.completeness = "complete";
        entities.requiresClarification = false;
        entities.correction = true;
        entities.proposedState = null;
      } else {
        intent = isCorrection ? INTENTS.CORRECT_LOCATION : INTENTS.PROVIDE_LOCATION;
        confidence = 0.86;
        entities.city = location.city;
        entities.state = null;
        entities.proposedState = location.proposedState;
        entities.completeness = "partial";
        entities.requiresClarification = true;
        entities.correction = isCorrection;
      }
    } else if (
      looksLikeName(text) &&
      !context?.knownFacts?.fullName &&
      !dayPartCtx &&
      context?.conversation?.lastQuestionAsked !== "ask_authorization"
    ) {
      intent = INTENTS.PROVIDE_NAME;
      confidence = 0.78;
      entities.name = text;
    } else if (isAffirmative(text)) {
      intent = INTENTS.SCHEDULE_CONFIRM;
      confidence = 0.55;
    }
  }

  // State token alone while awaiting location confirmation.
  if (
    intent === INTENTS.UNKNOWN &&
    locationCtx &&
    normalizeStateToken(text) &&
    context?.knownFacts?.city
  ) {
    intent = INTENTS.PROVIDE_LOCATION;
    confidence = 0.9;
    entities.city = context.knownFacts.city;
    entities.state = normalizeStateToken(text);
    entities.completeness = "complete";
  }

  const explicitFromTurn =
    intent === INTENTS.REQUEST_LANGUAGE_SWITCH
      ? entities.requestedLanguage
      : options.explicitLanguagePreference || null;

  const languageResolution = resolveConversationalLanguage({
    context,
    messageLanguage,
    intent,
    text,
    explicitPreference: explicitFromTurn
  });

  return {
    intent,
    confidence,
    entities,
    messageLanguage,
    preferredLanguage: languageResolution.preferredLanguage,
    languageMeta: languageResolution.languageMeta,
    languageAdapted: languageResolution.adapted,
    languageReason: languageResolution.reason,
    flexibleParsing: flexible,
    scheduleParse: schedule || null,
    requiresClarification: Boolean(entities.requiresClarification)
  };
}

module.exports = {
  interpretInboundMessage,
  detectMessageLanguageHint,
  formatTimeEntity,
  isAffirmative,
  isOptionSelection,
  isEchoOfLastQuestion,
  isGreeting,
  looksLikeName,
  looksLikeAmbiguousFragment,
  looksLikeOpportunityQuestion,
  looksLikeInsuranceQuestion,
  looksLikeLicenseRequirementQuestion,
  looksLikeCompensationQuestion,
  looksLikeWorkAuthorizationAnswer,
  looksLikeExplicitLanguageSwitch,
  parseDayPart
};
