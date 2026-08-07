/**
 * Recruit AI v2 — constrained response renderer.
 * Language-sticky templates only; no LLM side effects; no bilingual mixing.
 * Uses Team Vision canonical workflow copy where available (BR-018/082).
 */

const { LANGUAGES } = require("./constants");
const { sanitizeCustomerCopy } = require("./sanitize");
const {
  getCanonicalFaqAnswer,
  getJobOpportunityFaqAnswer,
  getInsuranceFaqAnswer,
  getLicenseRequirementFaqAnswer,
  getLicensePathDetailFaqAnswer,
  getCompensationFaqAnswer,
  getFixedEmploymentPreferenceMessage,
  getCurrentNotFitClosureMessage,
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
    continue_after_day_part:
      "Perfect. What time in the morning or afternoon works best for you?",
    acknowledge_morning_ask_time:
      "Perfect. What time in the morning works best for you?",
    acknowledge_afternoon_ask_time:
      "Perfect. What time in the afternoon works best for you?",
    explain_pending_day_part:
      "I mean the interview schedule. Do you prefer morning or afternoon?",
    explain_pending_morning_time:
      "I mean the interview time. I already noted you prefer morning — what time works best?",
    explain_pending_afternoon_time:
      "I mean the interview time. I already noted you prefer afternoon — what time works best?",
    explain_pending_time:
      "I mean the interview time. What time works best for you?",
    explain_pending_confirm_slot:
      "I was confirming the appointment time. Does {dateLabel} at {requestedTime} still work?",
    explain_pending_authorization:
      "I still need to know whether you have work authorization to work in the United States.",
    explain_pending_location:
      "I still need your city and state so we can continue.",
    explain_pending_date:
      "I mean which day works for the interview. What day works best for you?",
    explain_pending_generic:
      "Happy to clarify — what I still need is the next detail for your interview. Could you share that?",
    clarify_license_type: null,
    clarify_work_auth_after_license: null,
    insurance_faq_then_resume: null,
    license_requirement_faq_then_resume: null,
    license_path_detail_faq_then_resume: null,
    compensation_faq_then_resume: null,
    job_opportunity_faq_then_resume: null,
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
    meeting_preference_zoom_confirm_slot:
      "Of course — we'll do it by Zoom. Does {dateLabel} at {requestedTime} still work for you?",
    meeting_preference_zoom_ask_time:
      "Got it — we can do the interview by Zoom. What time works best after {earliestTime}?",
    meeting_preference_in_person:
      "Got it — we can do the interview in person. Do you prefer morning or afternoon?",
    meeting_preference_in_person_then_auth: null,
    meeting_preference_in_person_confirm_slot:
      "Perfect. Does {dateLabel} at {requestedTime} still work for an in-person interview?",
    meeting_preference_in_person_office_confirm_slot:
      "Perfect. That would be at our Doral office. Does {dateLabel} at {requestedTime} work for you?",
    meeting_preference_in_person_ask_time:
      "Got it — we can do the interview in person. What time works best after {earliestTime}?",
    confirm_in_person_travel_doral:
      "Of course. Our office is in Doral, at 2500 NW 79th Ave, Suite 189. Does coming to Doral work for you?",
    acknowledge_cancel_no_write:
      "Understood — I've noted your cancel request. A teammate will confirm any changes; nothing was changed automatically.",
    acknowledge_withdraw_no_write:
      "I understand. Thanks for letting us know. I wish you every success.",
    acknowledge_opt_out_no_write:
      "Understood — I've noted your request to stop messages. Nothing was changed automatically.",
    acknowledge_fixed_employment_preference: null,
    acknowledge_current_not_fit_no_write: null,
    acknowledge_known_availability:
      "You're right — you already told me you're available after {earliestTime}. What time works best?",
    acknowledge_known_availability_confirm_slot:
      "You're right — you already told me you're available after {earliestTime}. Does {dateLabel} at {requestedTime} still work?",
    ask_time_after_constraint:
      "Got it — you're available after {earliestTime}. What time works best for you?",
    zoom_link_after_confirm:
      "Of course. The Zoom link is shared once we confirm the appointment. What day and time work for you?",
    zoom_link_after_confirm_with_slot:
      "Of course. The Zoom link is shared once we confirm the appointment. For now, does {dateLabel} at {requestedTime} work for you?",
    zoom_link_canonical_share:
      "Of course. Here is the Zoom link: {zoomUrl}",
    zoom_link_pending_unavailable:
      "Of course. The Zoom link is not available yet — we'll share it as soon as it's ready.",
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
    continue_after_day_part:
      "Perfecto. ¿Qué hora en la mañana o en la tarde te funciona mejor?",
    acknowledge_morning_ask_time:
      "Perfecto. ¿Qué hora en la mañana te funciona mejor?",
    acknowledge_afternoon_ask_time:
      "Perfecto. ¿Qué hora en la tarde te funciona mejor?",
    explain_pending_day_part:
      "Me refiero al horario de la entrevista. ¿Prefieres en la mañana o en la tarde?",
    explain_pending_morning_time:
      "Me refiero a la hora de la entrevista. Ya anoté que prefieres en la mañana; ¿qué hora te funciona mejor?",
    explain_pending_afternoon_time:
      "Me refiero a la hora de la entrevista. Ya anoté que prefieres en la tarde; ¿qué hora te funciona mejor?",
    explain_pending_time:
      "Me refiero a la hora de la entrevista. ¿Qué hora te funciona mejor?",
    explain_pending_confirm_slot:
      "Estaba confirmando el horario de la cita. ¿Te funciona el {dateLabel} a las {requestedTime}?",
    explain_pending_authorization:
      "Todavía necesito saber si tienes autorización o documentación para trabajar en Estados Unidos.",
    explain_pending_location:
      "Todavía necesito tu ciudad y estado para continuar.",
    explain_pending_date:
      "Me refiero al día de la entrevista. ¿Qué día te funciona mejor?",
    explain_pending_generic:
      "Con gusto te aclaro — todavía necesito el siguiente dato para tu entrevista. ¿Me lo puedes compartir?",
    clarify_license_type: null,
    clarify_work_auth_after_license: null,
    insurance_faq_then_resume: null,
    license_requirement_faq_then_resume: null,
    license_path_detail_faq_then_resume: null,
    compensation_faq_then_resume: null,
    job_opportunity_faq_then_resume: null,
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
    meeting_preference_zoom_confirm_slot:
      "Claro, lo hacemos por Zoom. ¿Te funciona todavía el {dateLabel} a las {requestedTime}?",
    meeting_preference_zoom_ask_time:
      "Entendido — podemos hacer la entrevista por Zoom. ¿Qué hora te funciona después de las {earliestTime}?",
    meeting_preference_in_person:
      "Entendido — podemos hacer la entrevista en persona. ¿Prefieres en la mañana o en la tarde?",
    meeting_preference_in_person_then_auth: null,
    meeting_preference_in_person_confirm_slot:
      "Perfecto. ¿Te funciona el {dateLabel} a las {requestedTime} para la entrevista en persona?",
    meeting_preference_in_person_office_confirm_slot:
      "Perfecto. Entonces sería en nuestra oficina de Doral. ¿Te funciona el {dateLabel} a las {requestedTime}?",
    meeting_preference_in_person_ask_time:
      "Entendido — podemos hacer la entrevista en persona. ¿Qué hora te funciona después de las {earliestTime}?",
    confirm_in_person_travel_doral:
      "Claro. Nuestra oficina está en Doral, en 2500 NW 79th Ave, Suite 189. ¿Te funciona venir hasta Doral?",
    acknowledge_cancel_no_write:
      "Entendido — anoté tu solicitud de cancelación. Un compañero confirmará cualquier cambio; no se modificó nada automáticamente.",
    acknowledge_withdraw_no_write:
      "Entiendo. Gracias por avisarnos. Te deseo mucho éxito.",
    acknowledge_opt_out_no_write:
      "Entendido — anoté tu solicitud de no recibir más mensajes. No se modificó nada automáticamente.",
    acknowledge_fixed_employment_preference: null,
    acknowledge_current_not_fit_no_write: null,
    acknowledge_known_availability:
      "Sí, tienes razón — me dijiste que puedes después de las {earliestTime}. ¿Qué hora te funciona mejor?",
    acknowledge_known_availability_confirm_slot:
      "Sí, tienes razón — me dijiste que puedes después de las {earliestTime}. ¿Te funciona el {dateLabel} a las {requestedTime}?",
    ask_time_after_constraint:
      "Entendido — puedes después de las {earliestTime}. ¿Qué hora te funciona mejor?",
    zoom_link_after_confirm:
      "Claro. El enlace se comparte cuando confirmemos la cita. ¿Qué día y hora te funcionan?",
    zoom_link_after_confirm_with_slot:
      "Claro. El enlace se comparte cuando confirmemos la cita. Por ahora, ¿te funciona el {dateLabel} a las {requestedTime}?",
    zoom_link_canonical_share:
      "Claro. Aquí está el enlace de Zoom: {zoomUrl}",
    zoom_link_pending_unavailable:
      "Claro. El enlace de Zoom aún no está disponible; te lo compartimos cuando esté listo.",
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
  IL: { en: "Illinois", es: "Illinois" },
  NJ: { en: "New Jersey", es: "Nueva Jersey" },
  PA: { en: "Pennsylvania", es: "Pensilvania" },
  OH: { en: "Ohio", es: "Ohio" },
  MI: { en: "Michigan", es: "Míchigan" },
  VA: { en: "Virginia", es: "Virginia" },
  WA: { en: "Washington", es: "Washington" },
  MA: { en: "Massachusetts", es: "Massachusetts" },
  CO: { en: "Colorado", es: "Colorado" },
  NV: { en: "Nevada", es: "Nevada" },
  OR: { en: "Oregon", es: "Oregón" },
  SC: { en: "South Carolina", es: "Carolina del Sur" },
  TN: { en: "Tennessee", es: "Tennessee" },
  DC: { en: "District of Columbia", es: "Distrito de Columbia" }
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
    case "explain_pending_day_part":
      return getDayPartQuestion(lang);
    case "acknowledge_morning_ask_time":
    case "explain_pending_morning_time":
      return language === LANGUAGES.SPANISH
        ? "¿Qué hora en la mañana te funciona mejor?"
        : "What time in the morning works best for you?";
    case "acknowledge_afternoon_ask_time":
    case "explain_pending_afternoon_time":
      return language === LANGUAGES.SPANISH
        ? "¿Qué hora en la tarde te funciona mejor?"
        : "What time in the afternoon works best for you?";
    case "ask_time_after_constraint":
    case "ask_time_preference":
    case "explain_pending_time":
      return language === LANGUAGES.SPANISH
        ? "¿Qué hora te funciona mejor?"
        : "What time works best for you?";
    case "confirm_date_with_time":
    case "explain_pending_confirm_slot":
      return language === LANGUAGES.SPANISH
        ? "¿Ese día y hora te funcionan?"
        : "Does that day and time still work?";
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
  return composeJobOpportunityThenResume(language, entities);
}

function composeJobOpportunityThenResume(language, entities = {}) {
  return composeFaqThenResume(
    getJobOpportunityFaqAnswer(localeCode(language)) ||
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

  // BR-084/088 — handoff copy only when decision explicitly requires a human.
  // Never remap uncertain escalate → scheduling "time unavailable" (FAQ collision).
  const requiresHuman = Boolean(entities.requiresHuman);
  if (!requiresHuman && key === "escalate_after_counteroffer_mismatch") {
    template = pack.offer_alternatives_no_handoff || pack.clarify_once;
  } else if (
    !requiresHuman &&
    (key === "safe_uncertain_escalate" || key === "safe_failure_escalate")
  ) {
    template = pack.clarify_once || pack.default;
  }

  if (
    key === "value_prop_then_qualify" ||
    key === "job_opportunity_faq_then_resume"
  ) {
    template = composeJobOpportunityThenResume(language, entities);
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
  } else if (key === "license_path_detail_faq_then_resume") {
    template = composeFaqThenResume(
      getLicensePathDetailFaqAnswer(lang),
      language,
      entities
    );
  } else if (key === "compensation_faq_then_resume") {
    template = composeFaqThenResume(
      getCompensationFaqAnswer(lang),
      language,
      entities
    );
  } else if (key === "acknowledge_fixed_employment_preference") {
    template = getFixedEmploymentPreferenceMessage(lang);
  } else if (key === "acknowledge_current_not_fit_no_write") {
    template = getCurrentNotFitClosureMessage(lang);
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

  // BR-085/087 — active Zoom must never mix Doral office address.
  // Confirmed in-person (even OUTSIDE coverage after travel OK) may mention the office.
  const meetingType = String(
    entities.preferredMeetingType || entities.meetingType || ""
  ).toLowerCase();
  const forceZoomNoOffice =
    meetingType === "zoom" ||
    (String(entities.coverage || "").toUpperCase() === "OUTSIDE" &&
      meetingType !== "in_person");
  if (
    forceZoomNoOffice &&
    key !== "confirm_in_person_travel_doral" &&
    key !== "meeting_preference_in_person_office_confirm_slot" &&
    /2500 NW 79th|oficinas ubicadas|Doral office/i.test(String(template || ""))
  ) {
    template =
      language === LANGUAGES.SPANISH
        ? pack.meeting_preference_zoom || pack.default
        : pack.meeting_preference_zoom || pack.default;
  }

  // Also apply earliestTime substitution for BR-087 templates.
  if (
    key === "acknowledge_known_availability" ||
    key === "acknowledge_known_availability_confirm_slot" ||
    key === "ask_time_after_constraint" ||
    key === "meeting_preference_zoom_ask_time" ||
    key === "meeting_preference_in_person_ask_time"
  ) {
    template = String(template || "").replace(/\{earliestTime\}/g, earliestLabel);
  }

  const zoomUrl = entities.zoomUrl || "";

  const rendered = String(template)
    .replace(/\{requestedTime\}/g, requestedTime)
    .replace(/\{earliestTime\}/g, earliestLabel)
    .replace(/\{ambiguousHour\}/g, ambiguousHour)
    .replace(/\{dateLabel\}/g, dateLabel)
    .replace(/\{zoomUrl\}/g, zoomUrl)
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
