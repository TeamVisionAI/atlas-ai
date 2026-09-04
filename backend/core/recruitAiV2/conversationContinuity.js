/**
 * Recruit AI v2 — contextual continuation & pending-question explanation (BR-088).
 * Every non-terminal reply must ask/confirm/explain the next step — no bare "Continuemos".
 */

const { canonicalizeCityName } = require("./locationFacts");

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Spanish live-canary — substantive info request (BR-131 answer-first).
 * Outranks greeting-only openers even when combined with "Hola".
 * QR Phase 3: map natural QR-adjacent info phrases into the same overview path
 * (no dedicated QR intent). Do not broaden bare "quiero" / "me interesa".
 */
function looksLikeSpanishInfoRequest(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\bquiero mas informacion\b/.test(t) ||
    /\bquiero informacion\b/.test(t) ||
    /\bquiero mas detalles\b/.test(t) ||
    // QR Phase 1 prefill / natural "tell me about the opportunity" (not bare "quiero").
    /\bquiero conocer mas (sobre|de) la oportunidad\b/.test(t) ||
    /\bdame (mas )?informacion\b/.test(t) ||
    /\bdame (mas )?(info|detalles)\b/.test(t) ||
    /\bquisiera (saber )?mas\b/.test(t) ||
    /\bquisiera (mas )?informacion\b/.test(t) ||
    /\bme interesa saber de que se trata\b/.test(t) ||
    /\bme interesa (saber )?mas\b/.test(t) ||
    /\bnecesito (mas )?informacion\b/.test(t) ||
    /\bpuedo (obtener|tener|recibir|pedir) (mas )?(info|informacion|detalles)\b/.test(
      t
    ) ||
    /\bme (puedes|puede|podrias) (dar|enviar|compartir) (mas )?(info|informacion|detalles)\b/.test(
      t
    ) ||
    /\bmas (info|informacion|detalles) (de|sobre) (esto|esta|eso)\b/.test(t) ||
    // QR-adjacent scan mentions → same job-overview FAQ path (not clarify_once).
    /\bvi el (codigo )?qr\b/.test(t) ||
    /\bescanee el codigo( qr)?\b/.test(t)
  );
}

/**
 * English BR-131 / QR bilingual parity — substantive info request.
 * Same overview path as Spanish; no dedicated QR intent.
 * Do not broaden bare "i want" / "i'm interested" / "i like".
 */
function looksLikeEnglishInfoRequest(text) {
  const t = normalizeText(text).replace(/[\u2018\u2019`]/g, "'");
  if (!t) {
    return false;
  }
  // Do not steal earnings / compensation / theme-interest phrases.
  if (
    /\b(make more money|earn more|how much|salary|commission|compensat|pay)\b/.test(
      t
    )
  ) {
    return false;
  }
  return (
    /\bi want to learn more about the opportunity\b/.test(t) ||
    /\bi would like more information\b/.test(t) ||
    /\bi'?d like more information\b/.test(t) ||
    /\btell me about the opportunity\b/.test(t) ||
    /\bi saw the (qr code|qr)\b/.test(t) ||
    /\bi scanned the (qr code|qr)\b/.test(t) ||
    // Natural first-turn / ad-click openers (Camila: "Can I get more info on this?")
    /\bcan i (get|have|receive) (more )?(info|information|details)\b/.test(t) ||
    /\bcould i (get|have|receive) (more )?(info|information|details)\b/.test(t) ||
    /\b(get|give me|send me|share) (more )?(info|information|details)\b/.test(
      t
    ) ||
    /\bi want more (info|information|details)\b/.test(t) ||
    /\bi'?d like more (info|details)\b/.test(t) ||
    /\bi would like more (info|details)\b/.test(t) ||
    /\bmore (info|information|details)( on| about)?( this| that)?\b/.test(t)
  );
}

/**
 * Spanish company / opportunity identity questions — never locations.
 */
function looksLikeCompanyIdentityQuestion(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\bque empresa (eres|es|son)\b/.test(t) ||
    /\bcual es la empresa\b/.test(t) ||
    /\bcomo se llama la (empresa|compania)\b/.test(t) ||
    /\bpara que (empresa|compania) (es|trabajan|trabaja)\b/.test(t) ||
    /\bcon que (empresa|compania) trabajan\b/.test(t) ||
    /\bde que empresa (eres|es|son)\b/.test(t) ||
    /\bwhat company (are you|is this|do you)\b/.test(t) ||
    /\bwhich company\b/.test(t) ||
    /\bwho do you work for\b/.test(t)
  );
}

/**
 * BR-097 — first-level "what is this about?" overview (progressive disclosure).
 * These stay job_opportunity_question for BR-088 priority, but render short copy.
 */
function looksLikeJobOverviewQuestion(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  // Employment-structure asks need the longer BR-088 framing, not the overview.
  if (
    /\b(esto|eso) es un (trabajo|empleo)\b/.test(t) ||
    /\bes (esto |eso )?un (trabajo|empleo)\b/.test(t) ||
    /\bes un trabajo de verdad\b/.test(t) ||
    /\bis this (a )?job\b/.test(t) ||
    /\bis this employment\b/.test(t) ||
    /\bis this a business opportunity\b/.test(t) ||
    /\bes una oportunidad de negocio\b/.test(t) ||
    /\bwhat kind of job\b/.test(t) ||
    /\bque tipo de trabajo( es)?\b/.test(t) ||
    /\b(part|full)[- ]?time\b/.test(t) ||
    /\btiempo (parcial|completo)\b/.test(t)
  ) {
    return false;
  }

  if (looksLikeSpanishInfoRequest(text) || looksLikeEnglishInfoRequest(text) || looksLikeCompanyIdentityQuestion(text)) {
    return true;
  }

  return (
    /\bwhat is this about\b/.test(t) ||
    /\bwhat is the (job|role|opportunity|work)\b/.test(t) ||
    /\bhow does this work\b/.test(t) ||
    /\bme (puedes|puede|podrias) explicar de que se trata\b/.test(t) ||
    /\bde que es la oportunidad\b/.test(t) ||
    /\bque es el (trabajo|empleo|rol)\b/.test(t) ||
    /\bpara que (seria|es|seria el|es el) (el )?(trabajo|empleo|rol)\b/.test(t) ||
    /\bpara que seria el (trabajo|empleo|rol)\b/.test(t) ||
    /\bwhat would the (job|role|work|position) be\b/.test(t) ||
    /\bwhat is the (job|role) for\b/.test(t) ||
    /\bwhat'?s the (job|role|work)\b/.test(t) ||
    /\bde que se trata\b/.test(t) ||
    /\bde que trata\b/.test(t) ||
    /\bde q(ue)? (se )?trata\b/.test(t) ||
    /\bde q(ue)? trata el (trabajo|empleo)\b/.test(t) ||
    /\bde que se trata el (trabajo|empleo)\b/.test(t) ||
    /\bde que es( el (trabajo|empleo))?\b/.test(t) ||
    /\b(dime )?(como) es el (trabajo|empleo)\b/.test(t) ||
    /\b(dime )?como funciona( el (trabajo|empleo))?\b/.test(t) ||
    /\bque es esto\b/.test(t) ||
    /\bque hacen\b/.test(t) ||
    /\bwhat do you (all |guys )?do\b/.test(t) ||
    /\btell me more\b/.test(t) ||
    /\bcan you tell me more\b/.test(t) ||
    /\bcan i get more info\b/.test(t) ||
    /\bmore info on this\b/.test(t) ||
    /\bwhat is the work\b/.test(t) ||
    /\bwhat'?s the work\b/.test(t) ||
    /\bwhere (would|do|will) i work\b/.test(t) ||
    /\bwhere (would|do|will) we work\b/.test(t) ||
    /\bque es el (trabajo|empleo)\b/.test(t) ||
    /\bcual es el (trabajo|empleo)\b/.test(t) ||
    /\bdonde (trabajaria|trabajo|trabajare|seria el trabajo)\b/.test(t) ||
    /\ben donde (seria|seria el|quedo|queda) (el )?trabajo\b/.test(t)
  );
}

/**
 * BR-131 — resume / "I just asked" copy requires conversation evidence.
 * lastQuestionAsked ask-keys or lastAtlasOutboundText from THIS prospect's
 * current V2 conversation count. current_step / missingFields / milestone /
 * unresolvedFields / qualification cursor alone do NOT.
 */
const PRIOR_ATLAS_ASK_KEYS = new Set([
  "ask_location",
  "ask_city",
  "ask_state",
  "confirm_location",
  "ask_authorization",
  "ask_day_part",
  "ask_time_preference",
  "ask_time_after_day_part",
  "ask_time_after_constraint",
  "confirm_slot",
  "awaiting_availability",
  "offer_time_choices",
  "clarify_license_type",
  "clarify_am_pm",
  "ask_date",
  "confirm_in_person_travel",
  "think_about_it_clarify"
]);

function hasConcretePriorAtlasQuestion(context) {
  const lastOut = String(
    context?.conversation?.lastAtlasOutboundText || ""
  ).trim();
  if (lastOut) {
    return true;
  }
  const lastQ = String(context?.conversation?.lastQuestionAsked || "")
    .trim()
    .toLowerCase();
  if (!lastQ || lastQ === "clarify" || lastQ === "clarify_once") {
    return false;
  }
  // Internal qualification tokens (DAY_PART, CITY, …) are not V2 ask-keys.
  if (PRIOR_ATLAS_ASK_KEYS.has(lastQ)) {
    return true;
  }
  return lastQ.startsWith("ask_") || lastQ.startsWith("explain_pending");
}

/**
 * Job / employment / opportunity questions — must never collapse into scheduling.
 */
function looksLikeJobOpportunityQuestion(text) {
  const raw = String(text || "").trim();
  const t = normalizeText(raw);
  if (!t) {
    return false;
  }
  // Avoid work-auth / availability phrases that contain "trabajo".
  if (
    /\b(permiso de trabajo|autorizacion|documentacion|trabajo hasta|despues de las|after \d)\b/.test(
      t
    )
  ) {
    return false;
  }

  if (looksLikeJobOverviewQuestion(raw)) {
    return true;
  }

  return (
    /\b(esto|eso) es un (trabajo|empleo)\b/.test(t) ||
    /\bes (esto |eso )?un (trabajo|empleo)\b/.test(t) ||
    /\bes un trabajo de verdad\b/.test(t) ||
    /\b(es|is (this )?)(part[- ]?time|full[- ]?time|tiempo (parcial|completo))\b/.test(
      t
    ) ||
    /\bde que es el trabajo\b/.test(t) ||
    /\b(dime )?(como) es el (trabajo|empleo)\b/.test(t) ||
    /\b(dime )?como funciona( el (trabajo|empleo))?\b/.test(t) ||
    /\bque tipo de trabajo( es)?\b/.test(t) ||
    /\bes una oportunidad de negocio\b/.test(t) ||
    /\bis this (a )?job\b/.test(t) ||
    /\bis this employment\b/.test(t) ||
    /\bis this (part[- ]?time|full[- ]?time)\b/.test(t) ||
    /\bwhat kind of job\b/.test(t) ||
    /\bis this a business opportunity\b/.test(t) ||
    /\b(que es esto|what is the (job|role|position|opportunity|work))\b/.test(t) ||
    /\bpara que (seria|es) (el )?(trabajo|empleo|rol)\b/.test(t) ||
    /\bwhat would the (job|role|work|position) be\b/.test(t) ||
    /\bwhere (would|do|will) i work\b/.test(t) ||
    /\bque es el (trabajo|empleo)\b/.test(t) ||
    /\bdonde (trabajaria|trabajo|trabajare|seria el trabajo)\b/.test(t) ||
    /\btell me more\b/.test(t)
  );
}

/**
 * BR-229 — office / "where are you located" questions, including common typos.
 * Must not be treated as a home-city correction or a handoff.
 */
function looksLikeOfficeLocationQuestion(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\bdonde (estan|esta|esran|quedan|queda|quedaria) (ubicad[oa]s?|la oficina|las oficinas|ustedes)\b/.test(
      t
    ) ||
    /\bdonde (estan|esta|esran) ubicad/.test(t) ||
    /\b(donde|en donde) (queda|quedan|estan) (la )?oficina/.test(t) ||
    /\bubicacion de (la |las )?oficinas?\b/.test(t) ||
    /\bwhere (are you|is (the )?(office|company)|are (the )?offices)( located)?\b/.test(
      t
    ) ||
    /\bwhere (is|are) (you|the office|your office|your offices)\b/.test(t) ||
    /\boffice location\b/.test(t)
  );
}

/**
 * BR-229 — nearby / proximity preference ("busco algo cerca de Hallandale").
 */
function looksLikeNearbyLocationPreference(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\b(busco|busca|husco|quiero|necesito).{0,48}\b(cerca|serca|cercano)\b/.test(
      t
    ) ||
    /\b(cerca|serca) (a|de|al)\b/.test(t) ||
    (/\bnear(by)?\b/.test(t) &&
      /\b(looking|want|need|office|something|close)\b/.test(t))
  );
}

function extractNearbyCityPreference(text) {
  const t = normalizeText(text);
  if (!t) {
    return null;
  }
  const aliasHit = t.match(
    /\b(halandey|hallandey|halandale|hallandale(?: beach)?)\b/
  );
  if (aliasHit) {
    return canonicalizeCityName(aliasHit[1]) || "Hallandale";
  }
  const nearHit = t.match(
    /\b(?:cerca|serca|near(?:by)?)\s+(?:a|de|al|to)?\s+([a-z][a-z ]{2,30})$/
  );
  if (nearHit) {
    return canonicalizeCityName(nearHit[1].trim()) || null;
  }
  return null;
}

/**
 * BR-229 — office / interview hours FAQ. Must not fall through to clarify_once
 * or lose pending in-person / scheduling state.
 */
function looksLikeOfficeHoursQuestion(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\ba que horas?\b.{0,20}\b(trabajas|trabajan|estan|esta|abre|abren)\b/.test(
      t
    ) ||
    /\bque horarios?\b.{0,24}\b(tienen|tiene|manejan|hay|estan)\b/.test(t) ||
    /\bque horas\b.{0,20}\b(estan|esta|trabajan|trabajas|tienen|alla)\b/.test(
      t
    ) ||
    /\bhorario(s)? de (la |las )?oficina\b/.test(t) ||
    /\ba que hora\b.{0,16}\b(abren|abre|estan|esta|trabajan)\b/.test(t) ||
    /\boffice hours\b/.test(t) ||
    /\bwhat (hours|times) (do you|are you)\b/.test(t) ||
    /\bwhat are your (hours|office hours|interview hours)\b/.test(t) ||
    /\bwhen are you (open|there|available|in the office)\b/.test(t)
  );
}

/**
 * BR-229 — date-unresolved ask for actual available days
 * ("Qué día puede ser", "Qué días tienes").
 */
function looksLikeAvailableDaysQuestion(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\bque dias?\b.{0,24}\b(puede|pueden|puede ser|tienes|tienen|hay|te funciona)\b/.test(
      t
    ) ||
    /\b(cual|cuales)\s+dias?\b/.test(t) ||
    /\bwhat days?\b.{0,20}\b(work|have|are available|can)\b/.test(t) ||
    /\bwhich days?\b/.test(t) ||
    /\bwhat day (can|works|is available)\b/.test(t)
  );
}

/**
 * Generic "share the datum I just asked" fallback is only for nonresponsive input.
 */
function looksLikeClarifiableNonresponsiveInput(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return true;
  }
  const t = normalizeText(raw);
  if (!t || /^(hmm+|um+|uh+|eh+|ok|okay|vale)$/.test(t)) {
    return true;
  }
  if (looksLikeJobOpportunityQuestion(raw) || looksLikeJobOverviewQuestion(raw)) {
    return false;
  }
  if (looksLikeOfficeLocationQuestion(raw) || looksLikeNearbyLocationPreference(raw)) {
    return false;
  }
  if (looksLikeOfficeHoursQuestion(raw) || looksLikeAvailableDaysQuestion(raw)) {
    return false;
  }
  if (looksLikeSpanishInfoRequest(raw) || looksLikeEnglishInfoRequest(raw)) {
    return false;
  }
  if (looksLikeConversationClarificationRequest(raw)) {
    return false;
  }
  return true;
}

/**
 * Meta-conversation: prospect asks what Atlas wants next.
 */
function looksLikeConversationClarificationRequest(text) {
  const t = normalizeText(text);
  if (!t) {
    return false;
  }
  return (
    /\bcontinuemos con (que|que)\b/.test(t) ||
    /\bcon que seguimos\b/.test(t) ||
    /\bque necesitas saber\b/.test(t) ||
    /\bque me estas preguntando\b/.test(t) ||
    /\bno entiendo que falta\b/.test(t) ||
    /\bque quieres saber\b/.test(t) ||
    /\bcontinue with what\b/.test(t) ||
    /\bwhat do you still need\b/.test(t) ||
    /\bwhat are you asking( me)?\b/.test(t) ||
    /\bwhat do you need to know\b/.test(t) ||
    /\bi'?m confused\b/.test(t) ||
    /\bim confused\b/.test(t) ||
    // Implements BR-195 — recoverable misunderstanding, not a handoff.
    /\bdisculp(ame|a)? (cual|que) dato\b/.test(t) ||
    /\b(cual|que) dato\b/.test(t) ||
    /\bque dato (necesitas|falta|quieres)\b/.test(t) ||
    /\bno (te )?entendi\b/.test(t) ||
    /\bwhat (data|detail) (do you need|are you asking)\b/.test(t) ||
    /\bwhich (data|detail)\b/.test(t) ||
    /\bwhat did you (just )?ask\b/.test(t)
  );
}

function lastQuestionImpliesDate(context) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "").toLowerCase();
  const lastOut = String(
    context?.conversation?.lastAtlasOutboundText || ""
  ).toLowerCase();
  if (
    lastQ.includes("ask_date") ||
    lastQ.includes("date_preference") ||
    lastQ === "acknowledge_date_ask_time"
  ) {
    return true;
  }
  return /qu[eé]\s+d[ií]a|what day|which day|qu[eé]\s+fecha|what date/.test(
    lastOut
  );
}

function lastQuestionImpliesDayPart(context) {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "").toLowerCase();
  const lastOut = String(
    context?.conversation?.lastAtlasOutboundText || ""
  ).toLowerCase();
  // Offered-slot / confirm menus often say "mañana"/"tarde" as calendar/time
  // wording — that is NOT a pending morning/afternoon preference question.
  if (
    lastQ === "offer_time_choices" ||
    lastQ === "offer_alternatives" ||
    lastQ === "offer_available_slots" ||
    lastQ === "confirm_slot" ||
    lastQ === "clarify_offered_slot_time" ||
    lastQ === "clarify_offered_slot_day"
  ) {
    return false;
  }
  if (
    lastQ.includes("day_part") ||
    lastQ.includes("daypart") ||
    lastQ.includes("ask_day_part")
  ) {
    return true;
  }
  return /mañana|manana|tarde|morning|afternoon|evening/.test(lastOut);
}

/**
 * Explain the currently pending workflow question (meta-conversation).
 */
function resolvePendingExplanation(context = {}, language = "spanish") {
  const lastQ = String(context?.conversation?.lastQuestionAsked || "");
  const dayPart = String(context?.knownFacts?.preferredDayPart || "").toLowerCase();
  const hasTime = Boolean(context?.appointment?.proposedTime);
  const hasDate = Boolean(context?.appointment?.proposedDate);
  const es = language === "spanish" || language === "es";

  if (
    lastQ === "ask_time_preference" ||
    lastQ === "ask_time_after_day_part" ||
    lastQ === "ask_time_after_constraint"
  ) {
    // Implements BR-105 — explain/resume using earliestTime when present.
    const earliest =
      context?.knownFacts?.availabilityConstraint?.earliestTime || null;
    if (earliest) {
      return {
        templateKey: "ask_time_after_constraint",
        lastQuestionAsked: "ask_time_preference",
        entities: { earliestTime: earliest, dayPart: dayPart || null }
      };
    }
    if (dayPart === "morning") {
      return {
        templateKey: "explain_pending_morning_time",
        lastQuestionAsked: "ask_time_preference",
        entities: { dayPart: "morning" }
      };
    }
    if (dayPart === "afternoon" || dayPart === "evening") {
      return {
        templateKey: "explain_pending_afternoon_time",
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

  if (lastQ.includes("day_part") || lastQ === "clarify_day_part") {
    return {
      templateKey: "explain_pending_day_part",
      lastQuestionAsked: lastQ || "ask_day_part",
      entities: {}
    };
  }

  if (lastQ === "awaiting_availability" && hasTime) {
    return {
      templateKey: "acknowledge_preference_awaiting_availability",
      lastQuestionAsked: "awaiting_availability",
      entities: {
        requestedTime: context.appointment.proposedTime
      }
    };
  }

  if (lastQ === "confirm_slot" && hasTime) {
    return {
      templateKey: "explain_pending_confirm_slot",
      lastQuestionAsked: "confirm_slot",
      entities: {
        requestedTime: context.appointment.proposedTime,
        dateLabel: context.appointment.proposedDateLabel || null
      }
    };
  }

  if (lastQ === "ask_authorization") {
    return {
      templateKey: "explain_pending_authorization",
      lastQuestionAsked: "ask_authorization",
      entities: {}
    };
  }

  if (
    lastQ.includes("location") ||
    lastQ === "ask_state" ||
    lastQ === "ask_city" ||
    lastQ === "confirm_location"
  ) {
    if (lastQ === "ask_city" && context.knownFacts?.state && !context.knownFacts?.city) {
      return {
        templateKey: "ask_city",
        lastQuestionAsked: "ask_city",
        entities: {
          state: context.knownFacts.state,
          proposedState: context.knownFacts.state
        }
      };
    }
    return {
      templateKey: "explain_pending_location",
      lastQuestionAsked: lastQ || "ask_location",
      entities: {
        city: context.knownFacts?.city || null
      }
    };
  }

  if (!hasDate && (lastQ.includes("date") || lastQuestionImpliesDate(context))) {
    return {
      templateKey: "explain_pending_date",
      lastQuestionAsked: lastQ || "ask_date",
      entities: {}
    };
  }

  // Fallback: restate the most useful open scheduling question.
  if (!dayPart && !hasTime) {
    return {
      templateKey: "explain_pending_day_part",
      lastQuestionAsked: "ask_day_part",
      entities: {}
    };
  }

  return {
    templateKey: es ? "explain_pending_generic" : "explain_pending_generic",
    lastQuestionAsked: lastQ || null,
    entities: {}
  };
}

/**
 * After a day-part answer, always ask for a clock time (never bare Continuemos).
 */
function resolveDayPartContinuation(dayPart, language = "spanish") {
  const part = String(dayPart || "").toLowerCase();
  if (part === "morning") {
    return {
      templateKey: "acknowledge_morning_ask_time",
      lastQuestionAsked: "ask_time_preference",
      entities: { dayPart: "morning" }
    };
  }
  if (part === "afternoon" || part === "evening") {
    return {
      templateKey: "acknowledge_afternoon_ask_time",
      lastQuestionAsked: "ask_time_preference",
      entities: { dayPart: part === "evening" ? "evening" : "afternoon" }
    };
  }
  return {
    templateKey: "explain_pending_day_part",
    lastQuestionAsked: "ask_day_part",
    entities: {}
  };
}

module.exports = {
  normalizeText,
  looksLikeSpanishInfoRequest,
  looksLikeEnglishInfoRequest,
  looksLikeCompanyIdentityQuestion,
  looksLikeJobOverviewQuestion,
  looksLikeJobOpportunityQuestion,
  looksLikeOfficeLocationQuestion,
  looksLikeNearbyLocationPreference,
  looksLikeOfficeHoursQuestion,
  looksLikeAvailableDaysQuestion,
  extractNearbyCityPreference,
  looksLikeClarifiableNonresponsiveInput,
  looksLikeConversationClarificationRequest,
  hasConcretePriorAtlasQuestion,
  lastQuestionImpliesDate,
  lastQuestionImpliesDayPart,
  resolvePendingExplanation,
  resolveDayPartContinuation
};
