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
  looksLikeLicensePathDetailQuestion
} = require("../teamVisionWorkflowCopy");
const {
  looksLikeJobOpportunityQuestion,
  looksLikeJobOverviewQuestion,
  looksLikeConversationClarificationRequest,
  lastQuestionImpliesDate,
  lastQuestionImpliesDayPart: continuityImpliesDayPart
} = require("./conversationContinuity");
const {
  looksLikeSalesObjection,
  classifySalesObjectionKind
} = require("./salesObjection");
const { looksLikeNetworkObjection } = require("./networkObjection");
const {
  looksLikeCompensationQuestion,
  classifyCompensationQuestionKind
} = require("./compensationQuestion");
const {
  isSoftAcknowledgement,
  hasConfirmableAppointmentProposal
} = require("./schedulingConfirmation");
const {
  looksLikePuertoRicoOriginStatement,
  looksLikeFixedEmploymentPreference,
  looksLikeCurrentJobSearchFocus,
  hasEmploymentFitContext
} = require("./employmentFit");
const {
  normalizeLanguage,
  APPOINTMENT_STATUS
} = require("./conversationContext");
const {
  parseLocationAnswer,
  normalizeStateToken,
  looksLikeLocationCorrection,
  proposeStateFromCity,
  isCompleteCityStatePhrase
} = require("./locationFacts");
const {
  normalizeInboundText,
  normalizeIntentText
} = require("./inputNormalization");
const {
  parseLicenseStatement,
  parseWorkAuthorizationAnswer,
  looksLikeDriversLicense,
  looksLikeFinancialLicense,
  looksLikeLicenseRequirementQuestion,
  mentionsLicense,
  mentionsWorkAuthorization,
  toBooleanWorkAuthorization,
  FINANCIAL_LICENSE_STATUS
} = require("./qualificationFacts");
const {
  parseAvailabilityConstraint,
  looksLikeDirectTimeProposal,
  resolveCandidateTime,
  isTimeLikeToken
} = require("./schedulingConstraints");
const {
  parseDateExclusions,
  extractDateCandidateHint,
  resolveDateCandidate,
  resolveDateExclusions,
  isDateOnlySchedule
} = require("./dateResolution");
const {
  looksLikeMeetingAccessRequest,
  looksLikeRepetitionSignal,
  hasAvailabilityConstraint
} = require("./schedulingMemory");
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

  // BR-085 — never coerce null hour → 0 (weekday-only was becoming 12:00 AM).
  const hourRaw =
    schedule.normalizedHour != null ? schedule.normalizedHour : schedule.hour;
  if (hourRaw == null) {
    return null;
  }

  const hour = Number(hourRaw);
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
  // Bare affirmations only — "si soy ciudadano" / "yes I'm a citizen" must not
  // classify as schedule_confirm via a leading si/yes (BR-100 / BR-102).
  return /^(ok|okay|yes|yep|yeah|sure|sounds good|that works|perfect|si|claro|por supuesto)$/i.test(
    t
  );
}

function isOptionSelection(text) {
  return /^[1-9]$/.test(String(text || "").trim());
}

function isGreeting(text) {
  const raw = String(text || "").trim();
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) {
    return false;
  }
  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening|hola|buenos dias|buenas tardes|buenas noches|buenas)$/i.test(
      t
    )
  ) {
    return true;
  }
  // Real-world opener: greeting + brief interest (still begin qualification).
  return /^(hola|hi|hello|hey)\b.{0,40}\b(quiero mas informacion|me interesa|quisiera (mas )?informacion|looking for (more )?info)\b/.test(
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
  // BR-088 — job/employment/opportunity phrases (statement or question).
  return looksLikeJobOpportunityQuestion(text);
}

/**
 * Implements BR-098 — insurance FAQ detection must work on BR-095 comparisonText
 * (punctuation stripped). Never require "?" to survive final routing.
 */
function looksLikeInsuranceQuestion(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) {
    return false;
  }
  // Affirmative "seguro" / "si seguro" is not an insurance FAQ.
  if (/^(si|yes|ok|okay)?\s*seguro$/.test(t)) {
    return false;
  }
  return (
    /\bis this (about )?insurance\b/.test(t) ||
    /\bis it insurance\b/.test(t) ||
    /\bdo you sell insurance\b/.test(t) ||
    /\bdoes this involve insurance\b/.test(t) ||
    /\bes (esto |eso )?(de )?seguros\b/.test(t) ||
    /\bes (esto |eso )?seguro\b/.test(t) ||
    /\bes para vender seguros\b/.test(t) ||
    /\bes vender seguros\b/.test(t) ||
    /\btrabajan con seguros\b/.test(t) ||
    /\bincluye seguros\b/.test(t) ||
    /^seguros$/.test(t)
  );
}

/**
 * Implements BR-098 — experience FAQ before permissive location parsing.
 */
function looksLikeExperienceQuestion(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) {
    return false;
  }
  return (
    /\b(necesito|se necesita|hay que tener|tengo que tener) (prior |previa )?experiencia\b/.test(
      t
    ) ||
    /\bno tengo experiencia\b/.test(t) ||
    /\bnunca he trabajado en esto\b/.test(t) ||
    /\bexperiencia\b.*\b(importa|necesaria|requerida|previa)\b/.test(t) ||
    /\bdo i need (prior |any )?experience\b/.test(t) ||
    /\bis experience required\b/.test(t) ||
    /\bi don'?t have (any |prior )?experience\b/.test(t) ||
    /\bi have no experience\b/.test(t) ||
    /\bi'?ve never done this before\b/.test(t) ||
    /\bi have never done this before\b/.test(t) ||
    /\bneed (prior |any )?experience\b/.test(t)
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

/**
 * BR-086 — natural-language communication opt-out / stop-contact.
 * Must win over location correction ("no …" openers) and name parsing.
 */
function looksLikeCommunicationOptOut(text) {
  const t = normalizeIntentText(text);
  if (!t) {
    return false;
  }

  if (/^(stop|alto|unsubscribe|basta)$/.test(t)) {
    return true;
  }
  if (/\b(opt[- ]?out|unsubscribe)\b/.test(t)) {
    return true;
  }

  // English stop-contact
  if (
    /\bno more (messages|texts|emails|whatsapps?)\b/.test(t) ||
    /\b(don'?t|do not|stop) (message|messaging|text|texting|contact)( me)?\b/.test(
      t
    ) ||
    /\b(don'?t|do not) (message|text|contact) me\b/.test(t) ||
    /\bstop (messaging|texting|contacting) me\b/.test(t) ||
    /\bleave me alone\b/.test(t) ||
    /\bremove me\b/.test(t) ||
    /\bplease stop (messaging|texting|contacting)\b/.test(t)
  ) {
    return true;
  }

  // Spanish stop-contact
  if (
    /\bno me escribas mas\b/.test(t) ||
    /\bno me mandes mas mensajes\b/.test(t) ||
    /\bno me (escribas|escriban|mandes|textees|contactes)\b/.test(t) ||
    /\bdeja de (escribirme|mandarme|textearme|contactarme)\b/.test(t) ||
    /\bno quiero mas (mensajes|textos|whatsapps?)\b/.test(t) ||
    /\b(eliminame|saquenme de la lista)\b/.test(t) ||
    /\bcancelar mensajes\b/.test(t) ||
    /\bno me escriban\b/.test(t)
  ) {
    return true;
  }

  return false;
}

/**
 * BR-091 — clear direct lack-of-interest / not-interested (EN/ES).
 * Distinct from communication opt-out, fixed-employment preference, and current_not_fit.
 */
function looksLikeDirectLackOfInterest(text) {
  const t = normalizeIntentText(text);
  if (!t) {
    return false;
  }
  // Never collapse stop-contact into withdraw.
  if (looksLikeCommunicationOptOut(t)) {
    return false;
  }

  // Spanish — bare "No me interesa" and close variants (no "ya" required).
  if (
    /\bno me interesa( esto)?\b/.test(t) ||
    /\besto no me interesa\b/.test(t) ||
    /\bno estoy interesad[oa]( en esto)?\b/.test(t) ||
    /\bno quiero (seguir|continuar)\b/.test(t)
  ) {
    return true;
  }

  // English
  if (
    /\bi('?m| am) not interested( in this)?\b/.test(t) ||
    /\bnot interested in this\b/.test(t) ||
    /^not interested$/.test(t) ||
    /\bi don'?t want to (continue|proceed)\b/.test(t)
  ) {
    return true;
  }

  return false;
}

/**
 * BR-085/086/091 — distinguish cancel appointment / withdraw interest / communication opt-out.
 */
function classifyCancellationIntent(text) {
  const t = normalizeIntentText(text);
  if (!t) {
    return null;
  }

  const hasOptOut = looksLikeCommunicationOptOut(t);

  const hasAppointmentCancel =
    /\b(cancela(r)? la cita|cancel (the |my )?appointment|cancel (the )?interview)\b/.test(
      t
    );
  // "cancelar mensajes" is opt-out, not appointment cancel.
  const hasGenericCancel =
    !/\bcancelar mensajes\b/.test(t) &&
    (/\b(cancelalo|cancelarlo|cancelala|cancelar|cancela|cancel it|cancel)\b/.test(
      t
    ) ||
      /\bmejor cancel/.test(t));
  const hasCancel = hasAppointmentCancel || hasGenericCancel;
  const hasWithdraw =
    looksLikeDirectLackOfInterest(t) ||
    /\b(cambie de idea|dejalo asi|olvidalo|never mind|changed my mind|forget it)\b/.test(
      t
    ) ||
    // Bare "ya no quiero" is withdraw; "no quiero más mensajes" is opt-out (hasOptOut).
    (/\bya no quiero\b/.test(t) && !hasOptOut) ||
    /\bno puedo ir\b/.test(t) ||
    /\bcan'?t make it\b/.test(t) ||
    /\bcannot make it\b/.test(t);

  // Combined: appointment cancel/withdraw + stop-contact — keep both signals.
  if (hasOptOut && (hasAppointmentCancel || hasCancel || hasWithdraw)) {
    return {
      intent: INTENTS.OPT_OUT_REQUEST,
      cancellationKind: "cancel_and_opt_out",
      alsoCancelAppointment: Boolean(hasAppointmentCancel || hasCancel),
      alsoWithdraw: Boolean(hasWithdraw),
      alsoOptOut: true
    };
  }

  if (hasOptOut) {
    return {
      intent: INTENTS.OPT_OUT_REQUEST,
      cancellationKind: "opt_out",
      alsoOptOut: true
    };
  }

  if (hasAppointmentCancel) {
    return {
      intent: INTENTS.CANCEL_REQUEST,
      cancellationKind: "cancel_appointment"
    };
  }
  if (hasCancel && hasWithdraw) {
    return {
      intent: INTENTS.WITHDRAW_INTEREST,
      cancellationKind: "withdraw_and_cancel",
      directLackOfInterest: looksLikeDirectLackOfInterest(t)
    };
  }
  if (hasCancel) {
    return {
      intent: INTENTS.CANCEL_REQUEST,
      cancellationKind: "cancel_appointment"
    };
  }
  if (hasWithdraw) {
    return {
      intent: INTENTS.WITHDRAW_INTEREST,
      cancellationKind: "withdraw_interest",
      directLackOfInterest: looksLikeDirectLackOfInterest(t)
    };
  }
  return null;
}

function looksLikeCancelRequest(text) {
  return Boolean(classifyCancellationIntent(text));
}

function looksLikeTravelConfirmation(text) {
  const t = normalizeIntentText(text);
  if (!t) {
    return false;
  }
  if (
    /^(si|yes|ok|okay|claro|perfecto|de acuerdo|dale|va)$/.test(t) ||
    /\b(puedo ir|puedo venir|me funciona|works for me|i can (go|come)|puedo llegar)\b/.test(
      t
    ) ||
    /\b(si[, ]+puedo|yes[, ]+i can)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * BR-085 — weekday/relative date without clock time is a date proposal, not midnight.
 */
function shouldTreatAsDateOnlyProposal(schedule, text, context) {
  if (!isDateOnlySchedule(schedule) && !extractDateCandidateHint(text)) {
    return false;
  }
  const dayHint = schedule?.dayHint || extractDateCandidateHint(text);
  if (!dayHint) {
    return false;
  }

  // BR-088 / BR-101 — Spanish "mañana" ambiguity is context-priority:
  // pending ask_day_part → morning (not tomorrow); pending date ask → tomorrow.
  if (dayHint.kind === "offset" && dayHint.days === 1) {
    const explicitDateFraming =
      /\b(puede ser|pasado|tomorrow|how about|mejor el|el dia|que dia|which day|what day)\b/i.test(
        text
      );
    if (
      lastQuestionImpliesDayPart(context) &&
      !lastQuestionImpliesDate(context) &&
      !explicitDateFraming
    ) {
      return false;
    }
    if (lastQuestionImpliesDate(context)) {
      return true;
    }
    if (
      parseDayPart(text)?.complete &&
      lastQuestionImpliesDayPart(context) &&
      !context?.appointment?.proposedTime
    ) {
      return false;
    }
  }

  return true;
}

function looksLikeRescheduleRequest(text) {
  return /\b(reschedule|reprogram|change (the )?(time|appointment|it)|can we change|cambiar (la )?hora|podemos cambiar)\b/i.test(
    String(text || "")
  );
}

function lastQuestionImpliesDayPart(context) {
  return continuityImpliesDayPart(context);
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Implements BR-101 — "en la mañana" / "por la mañana" are morning day-part,
  // not date-tomorrow when ask_day_part is pending.
  if (
    /^(morning|manana|por la manana|en la manana|a la manana|in the morning|1)$/.test(
      t
    ) ||
    /\b(por la manana|en la manana|a la manana|in the morning)\b/.test(t)
  ) {
    return { dayPart: "morning", complete: true };
  }
  if (
    /^(afternoon|evening|tarde|por la tarde|en la tarde|in the afternoon|2)$/.test(
      t
    ) ||
    /\b(afternoon|evening|por la tarde|en la tarde)\b/.test(t)
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
  // Bare clock tokens are time proposals, not day-part fragments (BR-084).
  if (isTimeLikeToken(trimmed)) {
    return false;
  }
  // BR-094/095 — parseable locations (incl. corrections like "no, doral") are not fragments.
  if (isCompleteCityStatePhrase(trimmed) || looksLikeLocationCorrection(trimmed)) {
    return false;
  }
  const loc = parseLocationAnswer(trimmed);
  if (
    loc &&
    (loc.completeness === "complete" ||
      loc.completeness === "partial" ||
      loc.completeness === "state_only")
  ) {
    return false;
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
    /\b(permiso|autoriz|authorization|vivo|live in|digo|insurance|licen[cs]ia|about|pagan|pago|salario|sueldo|comision|comisión|compensacion|compensación)\b/i.test(
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
  // BR-095 — raw preserved for audit; comparisonText used for deterministic matching.
  const inbound = normalizeInboundText(message?.text ?? message ?? "");
  const originalText = inbound.trimmedText;
  const text = inbound.comparisonText;
  const flexible =
    options.flexible !== undefined
      ? Boolean(options.flexible)
      : isConversationalScheduleFlexibilityEnabled();

  const appointmentStatus = context?.appointment?.status || APPOINTMENT_STATUS.NONE;
  const dayPartCtxEarly = lastQuestionImpliesDayPart(context);
  const schedulingActive =
    appointmentStatus === APPOINTMENT_STATUS.PROPOSED ||
    appointmentStatus === APPOINTMENT_STATUS.CONFIRMED ||
    appointmentStatus === APPOINTMENT_STATUS.RESCHEDULE_REQUESTED ||
    context?.currentStage === "scheduling" ||
    context?.currentStage === "proposed" ||
    context?.currentStage === "confirmed" ||
    context?.currentStage === "rescheduling" ||
    dayPartCtxEarly ||
    Boolean(context?.appointment?.proposedTime) ||
    Boolean(context?.knownFacts?.availabilityConstraint);

  // BR-084 — allow bare HH:MM during day-part / open scheduling negotiation.
  const schedulingPhase = schedulingActive ? "OVERRIDE" : undefined;

  const scheduleText = String(text || "").replace(/[?]+$/g, "").trim();
  const availabilityConstraint = parseAvailabilityConstraint(text);
  const schedule = availabilityConstraint
    ? null
    : parseScheduleRequest(scheduleText, {
        flexible,
        phase: schedulingPhase
      });
  let requestedTime = formatTimeEntity(schedule);
  let needsAmPmClarification = false;
  let ambiguousHour = null;

  if (!availabilityConstraint && (requestedTime || looksLikeDirectTimeProposal(text))) {
    const resolved = resolveCandidateTime(text, context, requestedTime);
    if (resolved.needsAmPmClarification) {
      needsAmPmClarification = true;
      ambiguousHour = resolved.ambiguousHour;
      requestedTime = null;
    } else if (resolved.time) {
      requestedTime = resolved.time;
    }
  }
  const hasTimeEntity = Boolean(requestedTime);
  const dateOnlyProposal =
    !availabilityConstraint &&
    !hasTimeEntity &&
    !needsAmPmClarification &&
    shouldTreatAsDateOnlyProposal(schedule, text, context);
  const dateCandidateHint =
    schedule?.dayHint || (dateOnlyProposal ? extractDateCandidateHint(text) : null);
  const dateExclusions = parseDateExclusions(text);
  const resolvedDate = dateCandidateHint
    ? resolveDateCandidate(dateCandidateHint, {
        timeZone: context?.timezone || "America/New_York",
        now: options.now || context?._testNow || undefined
      })
    : null;
  const resolvedExclusions = resolveDateExclusions(dateExclusions, {
    timeZone: context?.timezone || "America/New_York",
    now: options.now || context?._testNow || undefined
  });

  const messageLanguage = detectMessageLanguageHint(originalText || text);

  let intent = INTENTS.UNKNOWN;
  let confidence = 0.4;
  const entities = {
    requestedDate: dateCandidateHint || schedule?.dayHint || null,
    requestedTime: dateOnlyProposal ? null : requestedTime,
    resolvedDate: resolvedDate || null,
    dateExclusions: resolvedExclusions,
    appointmentType: null,
    optionIndex: isOptionSelection(originalText) ? Number(originalText.trim()) : null,
    rawText: inbound.rawText || originalText,
    normalizedText: inbound.normalizedText,
    accentFoldedText: inbound.accentFoldedText,
    comparisonText: inbound.comparisonText,
    city: null,
    state: null,
    proposedState: null,
    dayPart: null,
    completeness: null,
    requiresClarification: false,
    name: null,
    availabilityConstraint: null,
    needsAmPmClarification: false,
    ambiguousHour: null,
    cancellationKind: null
  };

  const isConfirmed = appointmentStatus === APPOINTMENT_STATUS.CONFIRMED;
  const dayPartCtx = dayPartCtxEarly;
  const locationCtx = lastQuestionImpliesLocation(context);
  const dayPartParse = parseDayPart(text);
  const cancellation = classifyCancellationIntent(text);
  const pendingTravelConfirm =
    String(context?.conversation?.pendingClarification || "") ===
    "confirm_in_person_travel";

  const languageSwitchTo = looksLikeExplicitLanguageSwitch(text);
  const authAnswer = looksLikeWorkAuthorizationAnswer(text, context);
  const licenseStatement = parseLicenseStatement(text);
  const pendingLicenseClarify =
    String(context?.conversation?.lastQuestionAsked || "") ===
    "clarify_license_type";

  if (isGreeting(text)) {
    intent = INTENTS.GREETING;
    confidence = 0.95;
  } else if (cancellation) {
    // BR-085/086/091 — cancel/withdraw/opt-out before location/name/FAQ/scheduling.
    intent = cancellation.intent;
    confidence = 0.94;
    entities.cancellationKind = cancellation.cancellationKind;
    entities.alsoCancelAppointment = Boolean(cancellation.alsoCancelAppointment);
    entities.alsoWithdraw = Boolean(cancellation.alsoWithdraw);
    entities.alsoOptOut = Boolean(cancellation.alsoOptOut);
    entities.directLackOfInterest = Boolean(cancellation.directLackOfInterest);
  } else if (pendingTravelConfirm && looksLikeZoomPreference(text)) {
    intent = INTENTS.PROVIDE_MEETING_PREFERENCE;
    confidence = 0.92;
    entities.appointmentType = "zoom";
  } else if (pendingTravelConfirm && looksLikeTravelConfirmation(text)) {
    intent = INTENTS.CONFIRM_IN_PERSON_TRAVEL;
    confidence = 0.94;
    entities.appointmentType = "in_person";
    entities.meetingTypeConfirmed = true;
  } else if (languageSwitchTo) {
    intent = INTENTS.REQUEST_LANGUAGE_SWITCH;
    confidence = 0.93;
    entities.requestedLanguage = languageSwitchTo;
  } else if (isEchoOfLastQuestion(text, context)) {
    intent = INTENTS.ECHO_OR_NOOP;
    confidence = 0.9;
  } else if (
    looksLikeCurrentJobSearchFocus(text) &&
    hasEmploymentFitContext(context)
  ) {
    // BR-090 — reinforced job-search focus after opportunity/preference explained.
    intent = INTENTS.CURRENT_NOT_FIT;
    confidence = 0.94;
    entities.currentFit = "not_now";
  } else if (looksLikeFixedEmploymentPreference(text)) {
    // BR-090 — preference outranks compensation FAQ when seeking fixed employment.
    if (
      context?.conversation?.fixedEmploymentAcknowledged === true ||
      context?.knownFacts?.employmentPreference === "fixed"
    ) {
      intent = INTENTS.CURRENT_NOT_FIT;
      confidence = 0.94;
      entities.currentFit = "not_now";
      entities.employmentPreference = "fixed";
    } else {
      intent = INTENTS.FIXED_EMPLOYMENT_PREFERENCE;
      confidence = 0.94;
      entities.employmentPreference = "fixed";
    }
  } else if (
    looksLikeCompensationQuestion(text) ||
    looksLikeCompensationQuestion(originalText)
  ) {
    // Implements BR-104 — compensation/earnings FAQ before scheduling/location/clarify.
    // Reuses existing COMPENSATION_QUESTION intent (BR-088/098).
    intent = INTENTS.COMPENSATION_QUESTION;
    confidence = 0.93;
    entities.compensationDetailKind =
      classifyCompensationQuestionKind(text) ||
      classifyCompensationQuestionKind(originalText) ||
      "general";
  } else if (looksLikeInsuranceQuestion(text) || looksLikeInsuranceQuestion(originalText)) {
    // BR-098 — detector must survive comparisonText (no "?") and raw variants.
    intent = INTENTS.INSURANCE_QUESTION;
    confidence = 0.92;
  } else if (
    looksLikeSalesObjection(text) ||
    looksLikeSalesObjection(originalText)
  ) {
    // Implements BR-099 — before experience FAQ and correction/location parsing.
    intent = INTENTS.SALES_OBJECTION;
    confidence = 0.94;
    entities.salesObjectionKind =
      classifySalesObjectionKind(text) ||
      classifySalesObjectionKind(originalText);
  } else if (
    looksLikeNetworkObjection(text) ||
    looksLikeNetworkObjection(originalText)
  ) {
    // Implements BR-103 — network/prospecting objection before clarify/confirm.
    intent = INTENTS.NETWORK_OBJECTION;
    confidence = 0.94;
  } else if (looksLikeExperienceQuestion(text) || looksLikeExperienceQuestion(originalText)) {
    // Implements BR-098 — experience FAQ before location/name/fragment handling.
    intent = INTENTS.EXPERIENCE_QUESTION;
    confidence = 0.93;
  } else if (looksLikeLicensePathDetailQuestion(text)) {
    // BR-089 — 2-14/2-15 path detail only when explicitly asked.
    intent = INTENTS.LICENSE_PATH_DETAIL_QUESTION;
    confidence = 0.94;
    entities.licensePathDetail = true;
  } else if (looksLikeLicenseRequirementQuestion(text)) {
    intent = INTENTS.LICENSE_REQUIREMENT_QUESTION;
    confidence = 0.92;
    entities.licensePathDetail = false;
  } else if (looksLikeJobOpportunityQuestion(text)) {
    intent = INTENTS.JOB_OPPORTUNITY_QUESTION;
    confidence = 0.93;
    // Implements BR-097 — first-level overview vs employment-framing detail.
    entities.jobFaqDetailLevel = looksLikeJobOverviewQuestion(text)
      ? "overview"
      : "employment_framing";
  } else if (looksLikeConversationClarificationRequest(text)) {
    intent = INTENTS.CONVERSATION_CLARIFICATION_REQUEST;
    confidence = 0.93;
  } else if (looksLikeMeetingAccessRequest(text)) {
    // Keep meeting logistics ahead of modality/time parsing (also checked later).
    intent = INTENTS.MEETING_ACCESS_REQUEST;
    confidence = 0.94;
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
    if (looksLikePuertoRicoOriginStatement(text)) {
      entities.puertoRicoOrigin = true;
    }
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
  } else if (availabilityConstraint) {
    // BR-084 — constraints are not appointment candidates.
    intent = INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT;
    confidence = 0.93;
    entities.availabilityConstraint = availabilityConstraint;
    entities.requestedTime = null;
    entities.repetitionSignal = looksLikeRepetitionSignal(text);
  } else if (
    looksLikeRepetitionSignal(text) &&
    hasAvailabilityConstraint(context)
  ) {
    // BR-087 — "ya te dije" with known after-5; do not force prospect to repeat.
    intent = INTENTS.REASSERT_KNOWN_FACT;
    confidence = 0.92;
    entities.repetitionSignal = true;
    entities.reassertedFact = "availability_constraint";
  } else if (needsAmPmClarification) {
    intent = INTENTS.CLARIFY_AM_PM;
    confidence = 0.9;
    entities.needsAmPmClarification = true;
    entities.ambiguousHour = ambiguousHour;
    entities.requiresClarification = true;
    entities.requestedTime = null;
  } else if (dateOnlyProposal && dateCandidateHint) {
    // BR-085 — weekday/date-only never becomes a time candidate.
    intent = INTENTS.SCHEDULING_DATE_PROPOSAL;
    confidence = 0.93;
    entities.requestedTime = null;
    entities.requestedDate = dateCandidateHint;
    entities.resolvedDate = resolvedDate;
    entities.dateExclusions = resolvedExclusions;
    entities.priorProposedTime = context?.appointment?.proposedTime || null;
  } else if (hasTimeEntity || looksLikeDirectTimeProposal(text)) {
    // Direct time overrides pending day-part (BR-084).
    if (isConfirmed) {
      intent = INTENTS.RESCHEDULE_REQUEST;
      confidence = 0.9;
    } else {
      intent = INTENTS.SCHEDULING_COUNTEROFFER;
      confidence = flexible ? 0.94 : 0.88;
    }
    entities.requestedTime = requestedTime;
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
  } else if (
    // Implements BR-103 — only confirm when a concrete slot was presented.
    hasConfirmableAppointmentProposal(context) &&
    (isAffirmative(text) ||
      isSoftAcknowledgement(text) ||
      /\b(est[aá] bien|sounds good|that works|perfecto|de acuerdo)\b/i.test(text))
  ) {
    intent = INTENTS.SCHEDULE_CONFIRM;
    confidence = 0.9;
    if (hasTimeEntity) {
      entities.requestedTime = requestedTime;
    }
  } else if (
    // Preference captured / availability pending — "ok" / "está bien" is soft ack only.
    isSoftAcknowledgement(text) ||
    (isAffirmative(text) &&
      (appointmentStatus === APPOINTMENT_STATUS.PROPOSED ||
        Boolean(context?.appointment?.proposedTime) ||
        context?.conversation?.lastQuestionAsked === "awaiting_availability" ||
        context?.conversation?.lastQuestionAsked === "confirm_slot")) ||
    ((!hasConfirmableAppointmentProposal(context) &&
      (context?.conversation?.lastQuestionAsked === "awaiting_availability" ||
        Boolean(context?.appointment?.proposedTime)) &&
      /\b(est[aá] bien|sounds good|that works|de acuerdo|perfecto)\b/i.test(text)))
  ) {
    intent = INTENTS.SOFT_ACKNOWLEDGEMENT;
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
  } else if (
    looksLikeAmbiguousFragment(text) &&
    !normalizeStateToken(text) &&
    !isCompleteCityStatePhrase(text)
  ) {
    // Fragments must not become names or city-only locations (BR-082).
    // BR-094 — do not treat "miami fl" / "Miami, FL" as ambiguous_fragment.
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
    } else if (
      // Implements BR-102 — state-only answers while asking city+state (no city yet).
      location?.completeness === "state_only" &&
      (locationCtx || lastQuestionImpliesLocation(context))
    ) {
      intent = INTENTS.PROVIDE_LOCATION;
      confidence = 0.9;
      entities.city = null;
      entities.state = location.state;
      entities.proposedState = null;
      entities.completeness = "state_only";
      entities.requiresClarification = true;
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
      const priorStateCertainty = context?.knownFacts?.stateCertainty || null;
      const priorStateOk =
        priorStateCertainty === "confirmed" && priorState;
      // BR-102 — city after retained state-only partial completes Miami + Florida.
      const priorStatePartial =
        Boolean(priorState) &&
        (priorStateCertainty === "partial" ||
          context?.conversation?.lastQuestionAsked === "ask_city");
      const proposed = location.proposedState || proposeStateFromCity(location.city);
      if (
        (isCorrection && priorStateOk && proposed && proposed === priorState) ||
        (priorStatePartial &&
          (!proposed || proposed === priorState || priorStateCertainty === "partial"))
      ) {
        intent = isCorrection ? INTENTS.CORRECT_LOCATION : INTENTS.PROVIDE_LOCATION;
        confidence = 0.9;
        entities.city = location.city;
        entities.state = priorState;
        entities.completeness = "complete";
        entities.requiresClarification = false;
        entities.correction = isCorrection;
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
      // Preserve original casing for names (BR-095 — do not store comparison form).
      entities.name = originalText;
    } else if (isSoftAcknowledgement(text) || isAffirmative(text)) {
      // Implements BR-103 — bare affirmations are never auto-confirm without a slot.
      intent = hasConfirmableAppointmentProposal(context)
        ? INTENTS.SCHEDULE_CONFIRM
        : INTENTS.SOFT_ACKNOWLEDGEMENT;
      confidence = hasConfirmableAppointmentProposal(context) ? 0.7 : 0.55;
    }
  }

  // State token alone while awaiting location confirmation.
  if (intent === INTENTS.UNKNOWN && locationCtx && normalizeStateToken(text)) {
    intent = INTENTS.PROVIDE_LOCATION;
    confidence = 0.9;
    if (context?.knownFacts?.city) {
      entities.city = context.knownFacts.city;
      entities.state = normalizeStateToken(text);
      entities.completeness = "complete";
      entities.requiresClarification = false;
    } else {
      // Implements BR-102 — state-only partial (ask city next).
      entities.city = null;
      entities.state = normalizeStateToken(text);
      entities.completeness = "state_only";
      entities.requiresClarification = true;
    }
  }

  const explicitFromTurn =
    intent === INTENTS.REQUEST_LANGUAGE_SWITCH
      ? entities.requestedLanguage
      : options.explicitLanguagePreference || null;

  const languageResolution = resolveConversationalLanguage({
    context,
    messageLanguage,
    intent,
    text: originalText || text,
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
    requiresClarification: Boolean(entities.requiresClarification),
    normalization: {
      rawText: inbound.rawText,
      trimmedText: inbound.trimmedText,
      comparisonText: inbound.comparisonText,
      tokenCount: inbound.tokens.length
    }
  };
}

module.exports = {
  interpretInboundMessage,
  normalizeInboundText,
  normalizeIntentText,
  detectMessageLanguageHint,
  formatTimeEntity,
  classifyCancellationIntent,
  looksLikeCommunicationOptOut,
  looksLikeDirectLackOfInterest,
  isAffirmative,
  isSoftAcknowledgement,
  hasConfirmableAppointmentProposal,
  looksLikeNetworkObjection,
  isOptionSelection,
  isEchoOfLastQuestion,
  isGreeting,
  looksLikeName,
  looksLikeAmbiguousFragment,
  looksLikeOpportunityQuestion,
  looksLikeJobOpportunityQuestion,
  looksLikeJobOverviewQuestion,
  looksLikeConversationClarificationRequest,
  looksLikeInsuranceQuestion,
  looksLikeExperienceQuestion,
  looksLikeSalesObjection,
  classifySalesObjectionKind,
  looksLikeLicenseRequirementQuestion,
  looksLikeCompensationQuestion,
  classifyCompensationQuestionKind,
  looksLikeWorkAuthorizationAnswer,
  looksLikeExplicitLanguageSwitch,
  looksLikePuertoRicoOriginStatement,
  looksLikeFixedEmploymentPreference,
  looksLikeCurrentJobSearchFocus,
  lastQuestionImpliesDate,
  lastQuestionImpliesDayPart,
  parseDayPart
};
