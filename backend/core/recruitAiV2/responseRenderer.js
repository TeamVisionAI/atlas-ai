/**
 * Recruit AI v2 — constrained response renderer.
 * Language-sticky templates only; no LLM side effects; no bilingual mixing.
 * Uses Team Vision canonical workflow copy where available (BR-018/082).
 */

const { LANGUAGES } = require("./constants");
const { sanitizeCustomerCopy } = require("./sanitize");
const {
  getCanonicalFaqAnswer,
  getLocalOfficeDayPartMessage,
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
    continue_after_day_part: "Thanks — noted. Let's continue.",
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
    meeting_preference_in_person:
      "Got it — we can do the interview in person. Do you prefer morning or afternoon?",
    acknowledge_cancel_no_write:
      "Understood — I've noted your cancel request. A teammate will confirm any changes; nothing was changed automatically.",
    clarify_day_part:
      "I didn't catch that — do you prefer morning or afternoon?",
    clarify_day_part_alt:
      "No problem. Please reply morning or afternoon so we can continue.",
    confirm_selected_slot:
      "Thanks. Before we lock anything in, please reply YES to confirm that time, or suggest another time.",
    acknowledge_counteroffer_check_availability:
      "Got it — you prefer {requestedTime}. Let me check availability for that time and share options that work.",
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
    continue_after_day_part: "Gracias — anotado. Continuemos.",
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
    meeting_preference_in_person:
      "Entendido — podemos hacer la entrevista en persona. ¿Prefieres en la mañana o en la tarde?",
    acknowledge_cancel_no_write:
      "Entendido — anoté tu solicitud de cancelación. Un compañero confirmará cualquier cambio; no se modificó nada automáticamente.",
    clarify_day_part:
      "No te entendí bien — ¿prefieres en la mañana o en la tarde?",
    clarify_day_part_alt:
      "Sin problema. Responde mañana o tarde para continuar.",
    confirm_selected_slot:
      "Gracias. Antes de confirmar, responde SI para confirmar esa hora, o sugiere otra hora.",
    acknowledge_counteroffer_check_availability:
      "Entendido — prefieres {requestedTime}. Voy a revisar disponibilidad y te comparto opciones que funcionen.",
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
    case "continue_qualification_after_authorization":
      return getLocalOfficeDayPartMessage(lang);
    case "clarify_day_part":
    case "ask_day_part":
    case "ask_day_part_simple":
      return getDayPartQuestion(lang);
    default:
      return getAuthorizationQuestion(lang);
  }
}

function composeValuePropThenQualify(language, entities = {}) {
  const faq = getCanonicalFaqAnswer(localeCode(language));
  const resumeKey = entities.resumeTemplateKey || "greeting_ask_location";
  // Mid-flow FAQ resume: prefer the short pending question, not a full office reprint.
  const resume =
    resumeKey === "continue_qualification_after_authorization"
      ? getDayPartQuestion(localeCode(language))
      : resolveResumeQuestion(resumeKey, language, entities);
  const bridge =
    language === LANGUAGES.SPANISH ? "Por cierto" : "By the way";
  return `${faq} ${bridge}, ${resume}`;
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

  if (key === "value_prop_then_qualify") {
    template = composeValuePropThenQualify(language, entities);
  } else if (key === "continue_qualification_after_authorization") {
    const ack =
      language === LANGUAGES.SPANISH ? "Perfecto, gracias." : "Perfect, thank you.";
    template = `${ack} ${getLocalOfficeDayPartMessage(lang)}`;
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

  const rendered = String(template)
    .replace(/\{requestedTime\}/g, requestedTime)
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
