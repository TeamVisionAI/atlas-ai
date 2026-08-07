/**
 * Recruit AI v2 — constrained response renderer.
 * Language-sticky templates only; no LLM side effects; no bilingual mixing.
 * Uses Team Vision canonical workflow copy where available (BR-018/082).
 */

const { LANGUAGES } = require("./constants");
const { sanitizeCustomerCopy } = require("./sanitize");
const {
  getCanonicalFaqAnswer,
  getInsuranceFaqAnswer,
  getLicenseRequirementFaqAnswer,
  getCompensationFaqAnswer,
  getClarifyLicenseTypeMessage,
  getClarifyWorkAuthAfterLicenseMessage,
  getOutsideZoomDayPartMessage,
  getLocalOfficeDayPartMessage,
  getRemoteZoomDayPartMessage,
  getAuthorizationDeniedMessage,
  getAuthorizationQuestion,
  getStateQuestion,
  getDayPartQuestion
} = require("../teamVisionWorkflowCopy");

const COPY = Object.freeze({
  english: {
    greeting_ask_location: "Hi! What city and state do you live in?",
    value_prop_then_qualify: null, // composed dynamically
    clarify_once:
      "Happy to help — could you share the detail I just asked for so we can keep moving?",
    confirm_location_proposal: "Perfect. {city}, {proposedStateName}?",
    ask_state: "Perfect. Which state is {city} in?",
    continue_qualification: "Thanks — that helps. Let's continue.",
    continue_qualification_after_location:
      "Thanks. Do you have work authorization or legal documentation to work in the United States?",
    continue_qualification_after_authorization: null, // canonical day-part
    outside_zoom_day_part: null,
    continue_after_day_part: "Thanks — noted. Let's continue.",
    clarify_license_type: null,
    clarify_work_auth_after_license: null,
    insurance_faq_then_resume: null,
    license_requirement_faq_then_resume: null,
    compensation_faq_then_resume: null,
    acknowledge_availability_then_resume: null,
    acknowledge_location_correction:
      "Perfect, thanks for clarifying. So you're in {city}, {proposedStateName}. {resumeQuestion}",
    acknowledge_correction_confirm_location:
      "Got it — thanks for the update. {city}, {proposedStateName}?",
    acknowledge_correction_ask_state:
      "Got it — thanks for the update. Which state is {city} in?",
    authorization_denied: null,
    language_switch_resume:
      "Of course — we can continue in English. {resumeQuestion}",
    meeting_preference_zoom:
      "Got it — we can do the interview by Zoom. Do you prefer morning or afternoon?",
    meeting_preference_zoom_then_auth: null,
    meeting_preference_in_person:
      "Got it — we can do the interview in person. Do you prefer morning or afternoon?",
    meeting_preference_in_person_then_auth: null,
    confirm_in_person_travel_doral:
      "Of course. Our office is in Doral, at 2500 NW 79th Ave, Suite 189. Does coming to Doral work for you?",
    acknowledge_cancel_no_write:
      "Understood — I've noted your cancel request. A teammate will confirm any changes; nothing was changed automatically.",
    acknowledge_withdraw_no_write:
      "Understood. We'll cancel the process for now. A teammate can reopen it if you change your mind later.",
    acknowledge_opt_out_no_write:
      "Understood — I've noted your request to stop messages. A teammate will confirm; nothing was changed automatically.",
    confirm_date_with_time:
      "Of course. Does {dateLabel} at {requestedTime} work for you?",
    acknowledge_date_ask_time:
      "Got it — {dateLabel} works. What time works best for you?",
    clarify_day_part:
      "I didn't catch that — do you prefer morning or afternoon?",
    clarify_day_part_alt:
      "No problem. Please reply morning or afternoon so we can continue.",
    confirm_selected_slot:
      "Thanks. Before we lock anything in, please reply YES to confirm that time, or suggest another time.",
    acknowledge_counteroffer_check_availability:
      "Got it — you prefer {requestedTime}. Let me check availability for that time and share options that work.",
    acknowledge_availability_constraint:
      "Got it — noted that you're available after {earliestTime}. What time works best for you?",
    clarify_am_pm: "Do you mean {ambiguousHour} in the morning or {ambiguousHour} in the afternoon/evening?",
    offer_alternatives_no_handoff:
      "That time may not be available. I can offer nearby options — what other time works for you?",
    escalate_after_counteroffer_mismatch:
      "Thanks for your patience. I'm looping in a Team Vision teammate to help find a time that works for you.",
    offer_reschedule_flow:
      "Your interview is confirmed, and we can reschedule. What day and time work better for you?",
    appointment_confirm_deferred:
      "Thanks — I've noted your confirmation. A teammate will finalize the booking details shortly.",
    safe_failure_escalate:
      "Thanks — I want to make sure this is handled correctly. A Team Vision teammate will follow up with you shortly.",
    safe_uncertain_escalate:
      "Thanks — a Team Vision teammate will follow up to help with the next step.",
    default: "Thanks — a Team Vision teammate will follow up shortly."
  },
  spanish: {
    greeting_ask_location: "Hola, ¿en qué ciudad y estado vives?",
    value_prop_then_qualify: null,
    clarify_once:
      "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?",
    confirm_location_proposal: "Perfecto. ¿{city}, {proposedStateName}?",
    ask_state: "Perfecto. ¿En qué estado está {city}?",
    continue_qualification: "Gracias — eso ayuda. Continuemos.",
    continue_qualification_after_location:
      "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
    continue_qualification_after_authorization: null,
    outside_zoom_day_part: null,
    continue_after_day_part: "Gracias — anotado. Continuemos.",
    clarify_license_type: null,
    clarify_work_auth_after_license: null,
    insurance_faq_then_resume: null,
    license_requirement_faq_then_resume: null,
    compensation_faq_then_resume: null,
    acknowledge_availability_then_resume: null,
    acknowledge_location_correction:
      "Perfecto, gracias por aclararlo. Entonces estás en {city}, {proposedStateName}. {resumeQuestion}",
    acknowledge_correction_confirm_location:
      "Entendido — gracias por la corrección. ¿{city}, {proposedStateName}?",
    acknowledge_correction_ask_state:
      "Entendido — gracias por la corrección. ¿En qué estado está {city}?",
    authorization_denied: null,
    language_switch_resume:
      "Claro — podemos continuar en español. {resumeQuestion}",
    meeting_preference_zoom:
      "Entendido — podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
    meeting_preference_zoom_then_auth: null,
    meeting_preference_in_person:
      "Entendido — podemos hacer la entrevista en persona. ¿Prefieres en la mañana o en la tarde?",
    meeting_preference_in_person_then_auth: null,
    confirm_in_person_travel_doral:
      "Claro. Nuestra oficina está en Doral, en 2500 NW 79th Ave, Suite 189. ¿Te funciona venir hasta Doral?",
    acknowledge_cancel_no_write:
      "Entendido — anoté tu solicitud de cancelación. Un compañero confirmará cualquier cambio; no se modificó nada automáticamente.",
    acknowledge_withdraw_no_write:
      "Entiendo. Cancelamos el proceso por ahora. Un compañero puede reabrirlo si cambias de idea más adelante.",
    acknowledge_opt_out_no_write:
      "Entendido — anoté tu solicitud de no recibir más mensajes. Un compañero confirmará; no se modificó nada automáticamente.",
    confirm_date_with_time:
      "Claro. ¿El {dateLabel} a las {requestedTime} te funciona?",
    acknowledge_date_ask_time:
      "Entendido — el {dateLabel} nos sirve. ¿Qué hora te funciona mejor?",
    clarify_day_part:
      "No te entendí bien — ¿prefieres en la mañana o en la tarde?",
    clarify_day_part_alt:
      "Sin problema. Responde mañana o tarde para continuar.",
    confirm_selected_slot:
      "Gracias. Antes de confirmar, responde SI para confirmar esa hora, o sugiere otra hora.",
    acknowledge_counteroffer_check_availability:
      "Entendido — prefieres {requestedTime}. Voy a revisar disponibilidad y te comparto opciones que funcionen.",
    acknowledge_availability_constraint:
      "Entendido — anoto que puedes después de las {earliestTime}. ¿Qué hora te funciona mejor?",
    clarify_am_pm:
      "¿Te refieres a las {ambiguousHour} de la mañana o a las {ambiguousHour} de la tarde?",
    offer_alternatives_no_handoff:
      "Esa hora puede no estar disponible. Puedo ofrecerte opciones cercanas — ¿qué otra hora te funciona?",
    escalate_after_counteroffer_mismatch:
      "Gracias por tu paciencia. Voy a conectar a un compañero de Team Vision para ayudarte a encontrar un horario.",
    offer_reschedule_flow:
      "Tu entrevista ya está confirmada y podemos reprogramarla. ¿Qué día y hora te funciona mejor?",
    appointment_confirm_deferred:
      "Gracias — anoté tu confirmación. Un compañero finalizará los detalles en breve.",
    safe_failure_escalate:
      "Gracias — quiero asegurarme de manejar esto correctamente. Un compañero de Team Vision te contactará pronto.",
    safe_uncertain_escalate:
      "Gracias — un compañero de Team Vision te contactará para el siguiente paso.",
    default: "Gracias — un compañero de Team Vision te contactará pronto."
  }
});

const STATE_DISPLAY = Object.freeze({
  FL: { en: "Florida", es: "Florida" },
  TX: { en: "Texas", es: "Texas" },
  NY: { en: "New York", es: "Nueva York" },
  CA: { en: "California", es: "California" },
  GA: { en: "Georgia", es: "Georgia" },
  AZ: { en: "Arizona", es: "Arizona" },
  NC: { en: "North Carolina", es: "Carolina del Norte" },
  IL: { en: "Illinois", es: "Illinois" }
});

function formatRequestedTime(hhmm, language) {
  if (!hhmm) {
    return language === LANGUAGES.SPANISH ? "esa hora" : "that time";
  }

  const [hRaw, mRaw] = String(hhmm).split(":");
  let hour = Number(hRaw);
  const minute = Number(mRaw || 0);
  if (!Number.isFinite(hour)) {
    return hhmm;
  }

  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, "0");
  return `${hour12}:${mm} ${meridiem}`;
}

function proposedStateName(code, language) {
  const entry = STATE_DISPLAY[String(code || "").toUpperCase()];
  if (!entry) {
    return code || "";
  }
  return language === LANGUAGES.SPANISH ? entry.es : entry.en;
}

function localeCode(language) {
  return language === LANGUAGES.SPANISH ? "es" : "en";
}

function resolveResumeQuestion(resumeTemplateKey, language, entities = {}) {
  const lang = localeCode(language);
  const city = entities.city || null;
  const proposed = entities.proposedState || entities.state || null;

  switch (resumeTemplateKey) {
    case "greeting_ask_location":
      return language === LANGUAGES.SPANISH
        ? "¿En qué ciudad y estado vives?"
        : "What city and state do you live in?";
    case "confirm_location_proposal":
      return getStateQuestion(city, lang, { proposedState: proposed });
    case "ask_state":
      return getStateQuestion(city, lang, {});
    case "continue_qualification_after_location":
      return getAuthorizationQuestion(lang);
    case "continue_qualification_after_authorization": {
      const forceZoom =
        String(entities.coverage || "").toUpperCase() === "OUTSIDE" ||
        String(entities.preferredMeetingType || "").toLowerCase() === "zoom" ||
        String(entities.meetingType || "").toLowerCase() === "zoom";
      return forceZoom
        ? getOutsideZoomDayPartMessage(entities.city, lang)
        : getLocalOfficeDayPartMessage(lang);
    }
    case "outside_zoom_day_part":
      return getOutsideZoomDayPartMessage(entities.city, lang);
    case "clarify_day_part":
    case "ask_day_part":
    case "ask_day_part_simple":
      return getDayPartQuestion(lang);
    case "clarify_license_type":
      return getClarifyLicenseTypeMessage(lang);
    case "clarify_work_auth_after_license":
      return getClarifyWorkAuthAfterLicenseMessage(lang);
    default:
      return getAuthorizationQuestion(lang);
  }
}

function composeFaqThenResume(faqText, language, entities = {}) {
  const resumeKey = entities.resumeTemplateKey || "greeting_ask_location";
  const resume =
    resumeKey === "continue_qualification_after_authorization" ||
    resumeKey === "outside_zoom_day_part"
      ? getDayPartQuestion(localeCode(language))
      : resolveResumeQuestion(resumeKey, language, entities);
  const bridge =
    language === LANGUAGES.SPANISH ? "Por cierto" : "By the way";
  return `${faqText} ${bridge}, ${resume}`;
}

function composeValuePropThenQualify(language, entities = {}) {
  return composeFaqThenResume(
    getCanonicalFaqAnswer(localeCode(language)),
    language,
    entities
  );
}

function renderCustomerReply(responsePlan) {
  const language =
    responsePlan?.language === LANGUAGES.SPANISH ? LANGUAGES.SPANISH : LANGUAGES.ENGLISH;
  const pack = COPY[language] || COPY.english;
  const key = responsePlan?.templateKey || "default";
  const entities = responsePlan?.entities || {};
  const requestedTime = formatRequestedTime(entities.requestedTime, language);
  const city = entities.city || "there";
  const stateCode = entities.state || entities.proposedState || null;
  const proposed = proposedStateName(stateCode, language);
  const lang = localeCode(language);

  let template = pack[key];

  // BR-084 — handoff copy only when decision explicitly requires a human.
  const requiresHuman = Boolean(entities.requiresHuman);
  if (
    !requiresHuman &&
    (key === "escalate_after_counteroffer_mismatch" ||
      key === "safe_uncertain_escalate" ||
      key === "safe_failure_escalate")
  ) {
    template = pack.offer_alternatives_no_handoff || pack.clarify_once;
  }

  if (key === "value_prop_then_qualify") {
    template = composeValuePropThenQualify(language, entities);
  } else if (key === "insurance_faq_then_resume") {
    template = composeFaqThenResume(
      getInsuranceFaqAnswer(lang),
      language,
      entities
    );
  } else if (key === "license_requirement_faq_then_resume") {
    template = composeFaqThenResume(
      getLicenseRequirementFaqAnswer(lang),
      language,
      entities
    );
  } else if (key === "compensation_faq_then_resume") {
    template = composeFaqThenResume(
      getCompensationFaqAnswer(lang),
      language,
      entities
    );
  } else if (key === "continue_qualification_after_authorization") {
    const ack =
      language === LANGUAGES.SPANISH ? "Perfecto, gracias." : "Perfect, thank you.";
    // Never emit Doral office copy when active modality is Zoom / OUTSIDE.
    const forceZoom =
      String(entities.coverage || "").toUpperCase() === "OUTSIDE" ||
      String(entities.preferredMeetingType || "").toLowerCase() === "zoom" ||
      String(entities.meetingType || "").toLowerCase() === "zoom";
    template = forceZoom
      ? `${ack} ${getOutsideZoomDayPartMessage(city === "there" ? null : city, lang)}`
      : `${ack} ${getLocalOfficeDayPartMessage(lang)}`;
  } else if (key === "outside_zoom_day_part") {
    const ack =
      language === LANGUAGES.SPANISH ? "Perfecto, gracias." : "Perfect, thank you.";
    template = `${ack} ${getOutsideZoomDayPartMessage(city === "there" ? null : city, lang)}`;
  } else if (key === "clarify_license_type") {
    template = getClarifyLicenseTypeMessage(lang);
  } else if (key === "clarify_work_auth_after_license") {
    template = getClarifyWorkAuthAfterLicenseMessage(lang);
  } else if (key === "acknowledge_availability_then_resume") {
    const resume = resolveResumeQuestion(
      entities.resumeTemplateKey || "continue_qualification_after_location",
      language,
      entities
    );
    const ack =
      language === LANGUAGES.SPANISH
        ? `Entendido — anoto tu preferencia de horario${
            requestedTime && requestedTime !== "esa hora"
              ? ` (${requestedTime})`
              : ""
          }.`
        : `Got it — I've noted your time preference${
            requestedTime && requestedTime !== "that time"
              ? ` (${requestedTime})`
              : ""
          }.`;
    const bridge =
      language === LANGUAGES.SPANISH ? "Por cierto" : "By the way";
    template = `${ack} ${bridge}, ${resume}`;
  } else if (
    key === "meeting_preference_zoom_then_auth" ||
    key === "meeting_preference_in_person_then_auth"
  ) {
    const ack =
      key === "meeting_preference_zoom_then_auth"
        ? language === LANGUAGES.SPANISH
          ? "Entendido — podemos hacer la entrevista por Zoom."
          : "Got it — we can do the interview by Zoom."
        : language === LANGUAGES.SPANISH
          ? "Entendido — podemos hacer la entrevista en persona."
          : "Got it — we can do the interview in person.";
    const resume = resolveResumeQuestion(
      entities.resumeTemplateKey || "continue_qualification_after_location",
      language,
      entities
    );
    template = `${ack} ${resume}`;
  } else if (key === "authorization_denied") {
    template = getAuthorizationDeniedMessage(lang);
  } else if (key === "language_switch_resume") {
    const resume = resolveResumeQuestion(
      entities.resumeTemplateKey || "continue_qualification_after_location",
      language,
      entities
    );
    template = (pack.language_switch_resume || "").replace(
      /\{resumeQuestion\}/g,
      resume
    );
  } else if (key === "acknowledge_location_correction") {
    const resume = resolveResumeQuestion(
      entities.resumeTemplateKey || "continue_qualification_after_location",
      language,
      entities
    );
    template = (pack.acknowledge_location_correction || "")
      .replace(/\{resumeQuestion\}/g, resume);
  }

  if (!template) {
    template = pack.default;
  }

  const earliestLabel = formatRequestedTime(
    entities.earliestTime || null,
    language
  );
  const ambiguousHour = entities.ambiguousHour != null ? String(entities.ambiguousHour) : "6";

  if (key === "acknowledge_availability_constraint") {
    template = (pack.acknowledge_availability_constraint || "").replace(
      /\{earliestTime\}/g,
      earliestLabel
    );
  } else if (key === "clarify_am_pm") {
    template = (pack.clarify_am_pm || "").replace(
      /\{ambiguousHour\}/g,
      ambiguousHour
    );
  }

  const dateLabel =
    entities.dateLabel ||
    entities.requestedDateLabel ||
    (language === LANGUAGES.SPANISH ? "ese día" : "that day");

  // BR-085 / renderer safety — active Zoom must never mix Doral office address.
  const activeZoom =
    String(entities.preferredMeetingType || "").toLowerCase() === "zoom" ||
    String(entities.meetingType || "").toLowerCase() === "zoom" ||
    String(entities.coverage || "").toUpperCase() === "OUTSIDE";
  if (
    activeZoom &&
    key !== "confirm_in_person_travel_doral" &&
    /2500 NW 79th|oficinas ubicadas/i.test(String(template || ""))
  ) {
    template =
      language === LANGUAGES.SPANISH
        ? pack.meeting_preference_zoom || pack.default
        : pack.meeting_preference_zoom || pack.default;
  }

  const rendered = String(template)
    .replace(/\{requestedTime\}/g, requestedTime)
    .replace(/\{earliestTime\}/g, earliestLabel)
    .replace(/\{ambiguousHour\}/g, ambiguousHour)
    .replace(/\{dateLabel\}/g, dateLabel)
    .replace(/\{city\}/g, city)
    .replace(/\{proposedStateName\}/g, proposed || "your state")
    .replace(/\{proposedState\}/g, entities.proposedState || "")
    .replace(/\{resumeQuestion\}/g, entities.resumeQuestion || "");

  const fallback = pack.safe_failure_escalate || pack.default;

  return {
    text: sanitizeCustomerCopy(rendered, fallback),
    language,
    templateKey: key
  };
}

module.exports = {
  renderCustomerReply,
  formatRequestedTime,
  composeValuePropThenQualify,
  resolveResumeQuestion,
  COPY
};
