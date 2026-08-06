/**
 * Recruit AI v2 — constrained response renderer.
 * Language-sticky templates only; no LLM side effects.
 */

const { LANGUAGES } = require("./constants");
const { sanitizeCustomerCopy } = require("./sanitize");

const COPY = Object.freeze({
  english: {
    value_prop_then_qualify:
      "Great question — Team Vision helps people build a career in financial services with training and mentorship. What city and state do you live in?",
    clarify_once:
      "Happy to help — could you share the detail I just asked for so we can keep moving?",
    continue_qualification: "Thanks — that helps. Let's continue.",
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
    value_prop_then_qualify:
      "Buena pregunta — Team Vision ayuda a construir una carrera en servicios financieros con entrenamiento y mentoria. ¿En qué ciudad y estado vives?",
    clarify_once:
      "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?",
    continue_qualification: "Gracias — eso ayuda. Continuemos.",
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

function renderCustomerReply(responsePlan) {
  const language =
    responsePlan?.language === LANGUAGES.SPANISH ? LANGUAGES.SPANISH : LANGUAGES.ENGLISH;
  const pack = COPY[language] || COPY.english;
  const key = responsePlan?.templateKey || "default";
  const template = pack[key] || pack.default;
  const requestedTime = formatRequestedTime(
    responsePlan?.entities?.requestedTime,
    language
  );

  const rendered = String(template).replace(/\{requestedTime\}/g, requestedTime);
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
  COPY
};
