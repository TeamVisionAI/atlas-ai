/**
 * Recruit AI v2 — contextual continuation & pending-question explanation (BR-088).
 * Every non-terminal reply must ask/confirm/explain the next step — no bare "Continuemos".
 */

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
    /\bdame (mas )?informacion\b/.test(t) ||
    /\bquisiera (saber )?mas\b/.test(t) ||
    /\bquisiera (mas )?informacion\b/.test(t) ||
    /\bme interesa saber de que se trata\b/.test(t) ||
    /\bme interesa (saber )?mas\b/.test(t) ||
    /\bnecesito (mas )?informacion\b/.test(t)
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

  if (looksLikeSpanishInfoRequest(text) || looksLikeCompanyIdentityQuestion(text)) {
    return true;
  }

  return (
    /\bwhat is this about\b/.test(t) ||
    /\bhow does this work\b/.test(t) ||
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
    /\btell me more\b/.test(t)
  );
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
    /\b(que es esto|what is the (job|role|position|opportunity))\b/.test(t) ||
    /\btell me more\b/.test(t)
  );
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
    /\bim confused\b/.test(t)
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
  looksLikeCompanyIdentityQuestion,
  looksLikeJobOverviewQuestion,
  looksLikeJobOpportunityQuestion,
  looksLikeConversationClarificationRequest,
  lastQuestionImpliesDate,
  lastQuestionImpliesDayPart,
  resolvePendingExplanation,
  resolveDayPartContinuation
};
