/**
 * Recruit AI v2 — constrained response renderer.
 * Language-sticky templates only; no LLM side effects; no bilingual mixing.
 * Uses Team Vision canonical workflow copy where available (BR-018/082).
 */

const { LANGUAGES } = require("./constants");
const { renderIulAdReply } = require("./iulAdConversation");
const { sanitizeCustomerCopy } = require("./sanitize");
const { collapseRedundantAcknowledgements } = require("./acknowledgementStyle");
const { stateDisplayName } = require("./locationFacts");
const {
  getCanonicalFaqAnswer,
  getJobOverviewFaqAnswer,
  getAdLeadFirstTouchMessage,
  getJobOpportunityFaqAnswer,
  getInsuranceFaqAnswer,
  getExperienceFaqAnswer,
  getSalesObjectionFaqAnswer,
  getNetworkObjectionFaqAnswer,
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
  getAmbiguousCityStateQuestion,
  getDayPartQuestion,
  getFirstMessage,
  getNaturalGreetingAck,
  getSoftInterviewTransitionQuestion,
  getThinkAboutItClarifyQuestion,
  getThinkAboutItInterviewOffer,
  getLegitimacyTrustFaqAnswer,
  getRecruitRoleObjectionFaqAnswer,
  getProspectGoalAck
} = require("../teamVisionWorkflowCopy");
const {
  composeAnswerThenOneQuestion,
  resolveFaqResumeTemplateKeyFromFacts
} = require("../recruitConversationSequencing");

const COPY = Object.freeze({
  english: {
    greeting_ask_location:
      "Hi! Thanks for reaching out. What city and state do you live in?",
    greeting_then_resume: null, // composed: natural ack + one resume question
    value_prop_then_qualify: null, // composed dynamically
    clarify_once:
      "Happy to help — could you share the detail I just asked for so we can keep moving?",
    confirm_location_proposal: "Perfect. {city}, {proposedStateName}?",
    ask_state: "Perfect. Which state is {city} in?",
    ask_city: "Thanks. What city in {proposedStateName} do you live in?",
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
    experience_faq_then_resume: null,
    sales_objection_faq_then_resume: null,
    network_objection_faq_then_resume: null,
    legitimacy_trust_faq_then_resume: null,
    recruit_role_objection_faq_then_resume: null,
    think_about_it_clarify: null,
    think_about_it_interview_offer: null,
    prospect_goal_ack_then_resume: null,
    acknowledge_preference_awaiting_availability: "Perfect.",
    job_opportunity_faq_then_resume: null,
    job_overview_faq_then_resume: null,
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
    ssn_privacy_reassure: null,
    ssn_privacy_reassure_in_person: null,
    ssn_privacy_reassure_then_day_part: null,
    ssn_privacy_reassure_in_person_then_day_part: null,
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
    // Implements BR-118 — soft media ack; do not ask for unrelated missing fields.
    acknowledge_non_text_media:
      "I received the file. A teammate can review it.",
    acknowledge_fixed_employment_preference: null,
    acknowledge_current_not_fit_no_write: null,
    acknowledge_known_availability:
      "You're right — you already told me you're available after {earliestTime}. What time works best?",
    // Implements BR-117 — slotConfirmPhrase includes day only when concrete.
    acknowledge_known_availability_confirm_slot:
      "You're right — you already told me you're available after {earliestTime}. Does {slotConfirmPhrase} still work?",
    ask_time_after_constraint:
      "Got it — you're available after {earliestTime}. What time after {earliestTime} works best for you?",
    clarify_time_after_constraint:
      "You'd said after {earliestTime}. What time from {earliestTime} onward works for you?",
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
      "Perfect — {slotConfirmPhrase}. Reply YES to confirm that time.",
    clarify_offered_slot_day:
      "I have {requestedTime} on more than one day. Which day works better for you?",
    clarify_offered_slot_time: null,
    acknowledge_counteroffer_check_availability:
      "Got it — you prefer {requestedTime}. Let me check availability for that time and share options that work.",
    // Implements BR-109 — ask the missing question; do not narrate internal note-taking.
    acknowledge_availability_constraint:
      "What time after {earliestTime} works best for you?",
    // Implements BR-107 — real Sprint 22 slots only (renderer fills from offeredSlots).
    offer_available_slots: null,
    offer_nearest_alternatives: null,
    acknowledge_no_qualifying_availability:
      "I don't have availability after {earliestTime} that day. What other day or time window works for you?",
    clarify_am_pm: "Do you mean {ambiguousHour} in the morning or {ambiguousHour} in the afternoon/evening?",
    offer_alternatives_no_handoff:
      "That time may not be available. I can offer nearby options — what other time works for you?",
    escalate_after_counteroffer_mismatch:
      "Thanks for your patience. I'm looping in a Team Vision teammate to help find a time that works for you.",
    offer_reschedule_flow:
      "Your interview is confirmed, and we can reschedule. What day and time work better for you?",
    appointment_confirm_deferred:
      "Thanks — I've noted your confirmation. A teammate will finalize the booking details shortly.",
    // BR-111 — only after canonical appointment success.
    appointment_confirmed:
      "Perfect — your interview is confirmed for {dateLabel} at {requestedTime}.",
    appointment_rescheduled:
      "Done — your interview is now scheduled for {dateLabel} at {requestedTime}.",
    appointment_create_failed:
      "Thanks — I want to make sure this is handled correctly. A Team Vision teammate will follow up with you shortly.",
    appointment_reschedule_failed:
      "Thanks — I want to make sure this is handled correctly. A Team Vision teammate will follow up with you shortly.",
    safe_failure_escalate:
      "Thanks — I want to make sure this is handled correctly. A Team Vision teammate will follow up with you shortly.",
    safe_uncertain_escalate:
      "Thanks — a Team Vision teammate will follow up to help with the next step.",
    default: "Thanks — a Team Vision teammate will follow up shortly."
  },
  spanish: {
    greeting_ask_location:
      "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?",
    greeting_then_resume: null,
    value_prop_then_qualify: null,
    clarify_once:
      "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?",
    confirm_location_proposal: "Perfecto. ¿{city}, {proposedStateName}?",
    ask_state: null,
    ask_city: "Gracias. ¿En qué ciudad de {proposedStateName} vives?",
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
    experience_faq_then_resume: null,
    sales_objection_faq_then_resume: null,
    network_objection_faq_then_resume: null,
    legitimacy_trust_faq_then_resume: null,
    recruit_role_objection_faq_then_resume: null,
    think_about_it_clarify: null,
    think_about_it_interview_offer: null,
    prospect_goal_ack_then_resume: null,
    acknowledge_preference_awaiting_availability: "Perfecto.",
    job_opportunity_faq_then_resume: null,
    job_overview_faq_then_resume: null,
    acknowledge_availability_then_resume: null,
    acknowledge_location_correction:
      "Perfecto, gracias por aclararlo. Entonces estás en {city}, {proposedStateName}. {resumeQuestion}",
    acknowledge_correction_confirm_location:
      "Entendido — gracias por la corrección. ¿{city}, {proposedStateName}?",
    acknowledge_correction_ask_state: null,
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
    ssn_privacy_reassure: null,
    ssn_privacy_reassure_in_person: null,
    ssn_privacy_reassure_then_day_part: null,
    ssn_privacy_reassure_in_person_then_day_part: null,
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
    // Implements BR-118 — soft media ack; do not ask for unrelated missing fields.
    acknowledge_non_text_media:
      "Recibí el archivo. Un compañero podrá revisarlo.",
    acknowledge_fixed_employment_preference: null,
    acknowledge_current_not_fit_no_write: null,
    acknowledge_known_availability:
      "Sí, tienes razón — me dijiste que puedes después de las {earliestTime}. ¿Qué hora te funciona mejor?",
    // Implements BR-117 — day phrase is injected only when dateLabel is concrete (never "el ese día").
    acknowledge_known_availability_confirm_slot:
      "Sí, tienes razón — me dijiste que puedes después de las {earliestTime}. ¿Te funciona {slotConfirmPhrase}?",
    ask_time_after_constraint:
      "Entendido — puedes después de las {earliestTime}. ¿Qué hora después de las {earliestTime} te funciona mejor?",
    clarify_time_after_constraint:
      "Me habías indicado después de las {earliestTime}. ¿Te funciona alguna hora a partir de las {earliestTime}?",
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
      "Perfecto, {slotConfirmPhrase}. Responde SI para confirmar esa hora.",
    clarify_offered_slot_day:
      "Tengo {requestedTime} en más de un día. ¿Qué día te funciona mejor?",
    clarify_offered_slot_time: null,
    acknowledge_counteroffer_check_availability:
      "Entendido — prefieres {requestedTime}. Voy a revisar disponibilidad y te comparto opciones que funcionen.",
    // Implements BR-109 — ask the missing question; do not narrate internal note-taking.
    acknowledge_availability_constraint:
      "¿Qué hora después de las {earliestTime} te funciona mejor?",
    // Implements BR-107 — real Sprint 22 slots only (renderer fills from offeredSlots).
    offer_available_slots: null,
    offer_nearest_alternatives: null,
    acknowledge_no_qualifying_availability:
      "No tengo disponibilidad después de las {earliestTime} ese día. ¿Qué otro día o horario te funciona?",
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
    // BR-111 — solo después del éxito canónico de la cita.
    appointment_confirmed:
      "Perfecto — tu entrevista quedó confirmada para el {dateLabel} a las {requestedTime}.",
    appointment_rescheduled:
      "Listo — tu entrevista quedó reprogramada para el {dateLabel} a las {requestedTime}.",
    appointment_create_failed:
      "Gracias — quiero asegurarme de manejar esto correctamente. Un compañero de Team Vision te contactará pronto.",
    appointment_reschedule_failed:
      "Gracias — quiero asegurarme de manejar esto correctamente. Un compañero de Team Vision te contactará pronto.",
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

/**
 * BR-108 — natural day wording from concrete dateKey (persist date separately).
 * Uses org-local today/tomorrow relative to entities.now / timezone.
 */
function formatSlotDayPhrase(dateKey, language, { now = null, timezone = null } = {}) {
  if (!dateKey) {
    return null;
  }
  const { partsInZone, ATLAS_DEFAULT_TIMEZONE } = require("../organizationDateWindow");
  const { WEEKDAY_LABELS } = require("./dateResolution");
  const tz = timezone || ATLAS_DEFAULT_TIMEZONE;
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const todayParts = partsInZone(nowMs, tz);
  const todayKey = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const tomorrowUtc = new Date(
    Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1, 12, 0, 0)
  );
  const tomorrowKey = `${tomorrowUtc.getUTCFullYear()}-${String(tomorrowUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrowUtc.getUTCDate()).padStart(2, "0")}`;

  const [y, m, d] = String(dateKey).split("-").map(Number);
  const weekdayIndex = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  const weekday =
    language === LANGUAGES.SPANISH
      ? WEEKDAY_LABELS.es[weekdayIndex]
      : WEEKDAY_LABELS.en[weekdayIndex];

  if (dateKey === todayKey) {
    return language === LANGUAGES.SPANISH ? "hoy" : "today";
  }
  if (dateKey === tomorrowKey) {
    return language === LANGUAGES.SPANISH
      ? `mañana ${weekday}`
      : `tomorrow (${weekday})`;
  }
  return language === LANGUAGES.SPANISH ? `el ${weekday}` : weekday;
}

function formatOfferedSlotPhrase(slot, language, options = {}) {
  const time = formatRequestedTime(slot?.time || slot?.timeKey, language);
  const day = formatSlotDayPhrase(slot?.date || slot?.dateKey, language, options);
  if (!day) {
    return language === LANGUAGES.SPANISH ? `a las ${time}` : `at ${time}`;
  }
  if (language === LANGUAGES.SPANISH) {
    return `${day} a las ${time}`;
  }
  return `${day} at ${time}`;
}

/**
 * BR-117 — concrete day+time confirmation, or neutral time-only when day unknown.
 * Never returns "el ese día".
 */
function formatSlotConfirmPhrase(entities = {}, language = LANGUAGES.ENGLISH) {
  const time = formatRequestedTime(entities.requestedTime, language);
  const rawLabel = entities.dateLabel || entities.requestedDateLabel || null;
  const neutral =
    !rawLabel ||
    rawLabel === "ese día" ||
    rawLabel === "that day";

  if (neutral) {
    return language === LANGUAGES.SPANISH ? `a las ${time}` : `${time}`;
  }

  // Spanish weekday / relative labels: "hoy", "mañana domingo", "domingo", "el domingo"
  if (language === LANGUAGES.SPANISH) {
    const needsArticle =
      !/^(hoy|mañana\b|el\s)/i.test(String(rawLabel).trim());
    const day = needsArticle ? `el ${rawLabel}` : rawLabel;
    return `${day} a las ${time}`;
  }

  return `${rawLabel} at ${time}`;
}

function proposedStateName(code, language) {
  const entry = STATE_DISPLAY[String(code || "").toUpperCase()];
  if (entry) {
    return language === LANGUAGES.SPANISH ? entry.es : entry.en;
  }
  // BR-102 — fall back to canonical U.S. state display for any USPS code.
  return stateDisplayName(code, language === LANGUAGES.SPANISH ? "spanish" : "english");
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
    case "ask_city": {
      const stateName = proposedStateName(proposed || entities.state, language);
      return language === LANGUAGES.SPANISH
        ? `¿En qué ciudad de ${stateName} vives?`
        : `What city in ${stateName} do you live in?`;
    }
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
    case "clarify_time_after_constraint": {
      // Implements BR-105 — resume with earliestTime, not day-part-only.
      const label = formatRequestedTime(entities.earliestTime || null, language);
      if (entities.earliestTime) {
        return language === LANGUAGES.SPANISH
          ? `¿Qué hora después de las ${label} te funciona mejor?`
          : `What time after ${label} works best for you?`;
      }
      return language === LANGUAGES.SPANISH
        ? "¿Qué hora te funciona mejor?"
        : "What time works best for you?";
    }
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
    case "acknowledge_preference_awaiting_availability":
      // BR-103 — preference already captured; do not re-ask time/auth/day-part.
      return "";
    case "clarify_license_type":
      return getClarifyLicenseTypeMessage(lang);
    case "clarify_work_auth_after_license":
      return getClarifyWorkAuthAfterLicenseMessage(lang);
    default:
      return getAuthorizationQuestion(lang);
  }
}

function composeFaqThenResume(faqText, language, entities = {}, options = {}) {
  // Implements BR-131 — never default back to location when later stage is known.
  let resumeKey = entities.resumeTemplateKey || null;
  if (!resumeKey) {
    resumeKey = resolveFaqResumeTemplateKeyFromFacts({
      city: entities.city || null,
      state: entities.state || null,
      proposedState: entities.proposedState || null,
      cityCertainty: entities.city ? "confirmed" : null,
      stateCertainty: entities.state || entities.proposedState ? "confirmed" : null,
      workAuthorization: entities.workAuthorization,
      workAuthorizationStatus: entities.workAuthorizationStatus,
      preferredDayPart: entities.dayPart || entities.preferredDayPart || null
    }).templateKey;
  }
  // Implements BR-137 — when qualification is complete, soft-invite interview
  // instead of a bare day-part ask after FAQ/objection.
  if (
    entities.softInterviewTransition &&
    (resumeKey === "continue_qualification_after_authorization" ||
      resumeKey === "outside_zoom_day_part" ||
      resumeKey === "ask_day_part_simple" ||
      resumeKey === "ask_day_part")
  ) {
    return composeAnswerThenOneQuestion(
      faqText,
      getSoftInterviewTransitionQuestion(
        localeCode(language),
        entities.prospectGoalTheme
      )
    );
  }
  const resume =
    resumeKey === "continue_qualification_after_authorization" ||
    resumeKey === "outside_zoom_day_part"
      ? getDayPartQuestion(localeCode(language))
      : resolveResumeQuestion(resumeKey, language, entities);
  return composeAnswerThenOneQuestion(faqText, resume);
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

/** BR-097 — short first-level overview + pending question, no caveat stack. */
function composeJobOverviewThenResume(language, entities = {}) {
  const lang = localeCode(language);
  const firstTouch = getAdLeadFirstTouchMessage(lang, entities);
  if (firstTouch) {
    return firstTouch;
  }
  const faqText =
    entities.jobFaqDetailLevel === "company_identity"
      ? getCanonicalFaqAnswer(lang)
      : getJobOverviewFaqAnswer(lang);
  return composeFaqThenResume(faqText, language, entities, { omitBridge: true });
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
    String(key).startsWith("iul_")
  ) {
    template = renderIulAdReply(key, language, entities);
  } else if (
    key === "value_prop_then_qualify" ||
    key === "job_opportunity_faq_then_resume"
  ) {
    template = composeJobOpportunityThenResume(language, entities);
  } else if (key === "greeting_then_resume") {
    // Implements BR-131 — natural greeting ack + one next-needed question only.
    const resumeKey =
      entities.resumeTemplateKey ||
      resolveFaqResumeTemplateKeyFromFacts({
        city: entities.city,
        state: entities.state,
        proposedState: entities.proposedState,
        cityCertainty: entities.city ? "confirmed" : null,
        stateCertainty: entities.state || entities.proposedState ? "confirmed" : null,
        workAuthorization: entities.workAuthorization,
        workAuthorizationStatus: entities.workAuthorizationStatus,
        preferredDayPart: entities.dayPart || entities.preferredDayPart
      }).templateKey;
    const resume =
      resumeKey === "continue_qualification_after_authorization" ||
      resumeKey === "outside_zoom_day_part"
        ? getDayPartQuestion(lang)
        : resolveResumeQuestion(resumeKey, language, entities);
    template = composeAnswerThenOneQuestion(
      getNaturalGreetingAck(lang),
      resume
    );
  } else if (key === "greeting_ask_location") {
    template = getFirstMessage(lang);
  } else if (key === "ask_state" || key === "acknowledge_correction_ask_state") {
    template = getStateQuestion(city === "there" ? null : city, lang, {});
  } else if (key === "job_overview_faq_then_resume") {
    template = composeJobOverviewThenResume(language, entities);
  } else if (key === "insurance_faq_then_resume") {
    template = composeFaqThenResume(
      getInsuranceFaqAnswer(lang),
      language,
      entities
    );
  } else if (key === "experience_faq_then_resume") {
    template = composeFaqThenResume(
      getExperienceFaqAnswer(lang),
      language,
      entities,
      { omitBridge: true }
    );
  } else if (key === "sales_objection_faq_then_resume") {
    template = composeFaqThenResume(
      getSalesObjectionFaqAnswer(lang, entities.salesObjectionKind),
      language,
      entities,
      { omitBridge: true }
    );
  } else if (key === "network_objection_faq_then_resume") {
    template = composeFaqThenResume(
      getNetworkObjectionFaqAnswer(lang),
      language,
      entities,
      { omitBridge: true }
    );
  } else if (key === "legitimacy_trust_faq_then_resume") {
    // Implements BR-137
    template = composeFaqThenResume(
      getLegitimacyTrustFaqAnswer(lang),
      language,
      entities,
      { omitBridge: true }
    );
  } else if (key === "recruit_role_objection_faq_then_resume") {
    // Implements BR-137
    template = composeFaqThenResume(
      getRecruitRoleObjectionFaqAnswer(lang),
      language,
      entities,
      { omitBridge: true }
    );
  } else if (key === "think_about_it_clarify") {
    template = getThinkAboutItClarifyQuestion(lang);
  } else if (key === "think_about_it_interview_offer") {
    template = getThinkAboutItInterviewOffer(lang);
  } else if (key === "prospect_goal_ack_then_resume") {
    // Implements BR-137 — acknowledge stated goal, then one resume/soft invite.
    template = composeFaqThenResume(
      getProspectGoalAck(lang, entities.prospectGoalTheme),
      language,
      entities,
      { omitBridge: true }
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
    // Implements BR-104 — progressive disclosure by compensationDetailKind.
    template = composeFaqThenResume(
      getCompensationFaqAnswer(lang, entities.compensationDetailKind || "general"),
      language,
      entities
    );
  } else if (key === "acknowledge_fixed_employment_preference") {
    template = getFixedEmploymentPreferenceMessage(lang);
  } else if (key === "acknowledge_current_not_fit_no_write") {
    template = getCurrentNotFitClosureMessage(lang);
  } else if (key === "continue_qualification_after_authorization") {
    // Single acknowledgement — stack collapse also strips leading "Excelente." from
    // canonical office/Zoom day-part copy (BR-102 conversation quality).
    const ack = language === LANGUAGES.SPANISH ? "Perfecto." : "Perfect.";
    // Never emit Doral office copy when active modality is Zoom / OUTSIDE.
    const forceZoom =
      String(entities.coverage || "").toUpperCase() === "OUTSIDE" ||
      String(entities.preferredMeetingType || "").toLowerCase() === "zoom" ||
      String(entities.meetingType || "").toLowerCase() === "zoom";
    template = forceZoom
      ? `${ack} ${getOutsideZoomDayPartMessage(city === "there" ? null : city, lang)}`
      : `${ack} ${getLocalOfficeDayPartMessage(lang)}`;
  } else if (key === "outside_zoom_day_part") {
    const ack = language === LANGUAGES.SPANISH ? "Perfecto." : "Perfect.";
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
    // Implements BR-109 — brief ack only; do not narrate "anoto"/note-taking.
    const ack =
      language === LANGUAGES.SPANISH
        ? requestedTime && requestedTime !== "esa hora"
          ? `Entendido — ${requestedTime}.`
          : "Entendido."
        : requestedTime && requestedTime !== "that time"
          ? `Got it — ${requestedTime}.`
          : "Got it.";
    const bridge =
      language === LANGUAGES.SPANISH ? "Por cierto" : "By the way";
    template = `${ack} ${bridge}, ${resume}`;
  } else if (String(key || "").startsWith("ssn_privacy_reassure")) {
    const ssn =
      language === LANGUAGES.SPANISH
        ? "No te pedimos el social ni ningún número de Seguro Social por WhatsApp. Esa información no se pide en este chat."
        : "We do not ask for your Social Security number over WhatsApp. That is never requested in this chat.";
    const inPerson = String(key).includes("in_person")
      ? language === LANGUAGES.SPANISH
        ? " Podemos hacer la entrevista en persona."
        : " We can do the interview in person."
      : "";
    const dayPart = String(key).includes("day_part")
      ? ` ${resolveResumeQuestion(
          "continue_qualification_after_authorization",
          language,
          entities
        )}`
      : "";
    template = `${ssn}${inPerson}${dayPart}`.trim();
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

  // Implements BR-119 — date already fixed on offered set; ask which time only.
  if (key === "clarify_offered_slot_time") {
    const offered = Array.isArray(entities.offeredSlots) ? entities.offeredSlots : [];
    const slotA = formatRequestedTime(
      offered[0]?.time || offered[0]?.timeKey || entities.slotA,
      language
    );
    const slotB = formatRequestedTime(
      offered[1]?.time || offered[1]?.timeKey || entities.slotB,
      language
    );
    if (slotA && slotB) {
      template =
        language === LANGUAGES.SPANISH
          ? `Perfecto. ¿Prefieres ${slotA} u ${slotB}?`
          : `Perfect. Do you prefer ${slotA} or ${slotB}?`;
    } else if (slotA) {
      template =
        language === LANGUAGES.SPANISH
          ? `Perfecto. ¿Te funciona a las ${slotA}?`
          : `Perfect. Does ${slotA} work for you?`;
    } else {
      template =
        language === LANGUAGES.SPANISH
          ? "Perfecto. ¿Qué hora de las opciones te funciona mejor?"
          : "Perfect. Which of the offered times works better for you?";
    }
  }

  // Implements BR-107 / BR-108 — build offer copy from real offeredSlots only (never invent).
  if (key === "offer_available_slots" || key === "offer_nearest_alternatives") {
    const offered = Array.isArray(entities.offeredSlots) ? entities.offeredSlots : [];
    const dayOptions = {
      now: entities.now || null,
      timezone: entities.timezone || offered[0]?.timezone || null
    };
    const dates = offered
      .map((slot) => slot?.date || slot?.dateKey)
      .filter(Boolean);
    const multiDate =
      Boolean(entities.rollingSearch) ||
      (dates.length >= 2 && new Set(dates).size > 1);
    const earliestLabel = formatRequestedTime(entities.earliestTime || null, language);
    const dateLabel = entities.dateLabel || null;
    const constraintPrefix =
      key === "offer_nearest_alternatives" && entities.earliestTime
        ? language === LANGUAGES.SPANISH
          ? dateLabel
            ? `Después de las ${earliestLabel} el ${dateLabel} no tengo disponibilidad. Lo más cercano que tengo es `
            : `Después de las ${earliestLabel} no tengo disponibilidad. Lo más cercano que tengo es `
          : dateLabel
            ? `I don't have availability after ${earliestLabel} on ${dateLabel}. The closest I have is `
            : `I don't have availability after ${earliestLabel}. The closest I have is `
        : "";

    if (entities.todayUnavailableAfterLead && offered.length >= 1) {
      const nextPhrase =
        offered.length >= 2 && multiDate
          ? language === LANGUAGES.SPANISH
            ? `${formatOfferedSlotPhrase(offered[0], language, dayOptions)} y ${formatOfferedSlotPhrase(offered[1], language, dayOptions)}`
            : `${formatOfferedSlotPhrase(offered[0], language, dayOptions)} and ${formatOfferedSlotPhrase(offered[1], language, dayOptions)}`
          : formatOfferedSlotPhrase(offered[0], language, dayOptions);
      template =
        language === LANGUAGES.SPANISH
          ? `Ya no tengo horarios disponibles para hoy, pero puedo ofrecerle ${nextPhrase}. ¿Le funciona?`
          : `I no longer have availability today, but I can offer ${nextPhrase}. Does that work for you?`;
    } else if (offered.length >= 2) {
      if (multiDate) {
        const phraseA = formatOfferedSlotPhrase(offered[0], language, dayOptions);
        const phraseB = formatOfferedSlotPhrase(offered[1], language, dayOptions);
        template =
          language === LANGUAGES.SPANISH
            ? `${constraintPrefix || "Tengo "}disponible ${phraseA} y ${phraseB}. ¿Cuál te funciona mejor?`
            : `${constraintPrefix || "I have "}availability ${phraseA} and ${phraseB}. Which works better for you?`;
      } else {
        const day = formatSlotDayPhrase(
          offered[0]?.date || offered[0]?.dateKey,
          language,
          dayOptions
        );
        const slotA = formatRequestedTime(
          offered[0]?.time || offered[0]?.timeKey || entities.slotA,
          language
        );
        const slotB = formatRequestedTime(
          offered[1]?.time || offered[1]?.timeKey || entities.slotB,
          language
        );
        if (day) {
          template =
            language === LANGUAGES.SPANISH
              ? `${constraintPrefix || "Tengo disponible "}${day} a las ${slotA} y a las ${slotB}. ¿Cuál te funciona mejor?`
              : `${constraintPrefix || "I have availability "}${day} at ${slotA} and ${slotB}. Which works better for you?`;
        } else {
          template =
            language === LANGUAGES.SPANISH
              ? `${constraintPrefix || "Tengo disponible "}a las ${slotA} y a las ${slotB}. ¿Cuál te funciona mejor?`
              : `${constraintPrefix || "I have availability "}at ${slotA} and ${slotB}. Which works better for you?`;
        }
      }
    } else if (offered.length >= 1 || entities.slotA) {
      const phrase = offered[0]
        ? formatOfferedSlotPhrase(offered[0], language, dayOptions)
        : formatRequestedTime(entities.slotA, language);
      template =
        language === LANGUAGES.SPANISH
          ? `${constraintPrefix || "Tengo disponible "}${offered[0] ? phrase : `a las ${phrase}`}. ¿Te funciona?`
          : `${constraintPrefix || "I have availability "}${offered[0] ? phrase : `at ${phrase}`}. Does that work for you?`;
    } else {
      template = pack.acknowledge_no_qualifying_availability;
    }
  }

  if (key === "acknowledge_no_qualifying_availability" && entities.rollingSearch) {
    const earliestLabel = formatRequestedTime(entities.earliestTime || null, language);
    template =
      language === LANGUAGES.SPANISH
        ? `No tengo disponibilidad después de las ${earliestLabel} en los próximos días. ¿Te funcionaría en otro horario?`
        : `I don't have availability after ${earliestLabel} in the coming days. Would a different time window work?`;
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
  } else if (
    key === "acknowledge_no_qualifying_availability" &&
    !entities.rollingSearch
  ) {
    template = (pack.acknowledge_no_qualifying_availability || "").replace(
      /\{earliestTime\}/g,
      earliestLabel
    );
  }

  const dateLabelRaw =
    entities.dateLabel || entities.requestedDateLabel || null;
  // Only rewrite ISO dateLabels to hoy/mañana. Preserve weekday labels
  // already set by formatDateLabel (e.g. "lunes") for confirm_date_with_time.
  const isoDateCandidate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateLabelRaw || ""))
    ? dateLabelRaw
    : !dateLabelRaw &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(entities.requestedDate || ""))
      ? entities.requestedDate
      : null;
  const relativeDayLabel = isoDateCandidate
    ? formatSlotDayPhrase(isoDateCandidate, language, {
        now: entities.now || null,
        timezone: entities.timezone || null
      })
    : null;
  const effectiveDateLabel = relativeDayLabel || dateLabelRaw;
  const dateLabelIsNeutral =
    !effectiveDateLabel ||
    effectiveDateLabel === "ese día" ||
    effectiveDateLabel === "that day";
  // Keep substitution for templates that still use {dateLabel}, but never invent
  // "ese día" into Spanish "el {dateLabel}" slots without a concrete day.
  const dateLabel = dateLabelIsNeutral
    ? language === LANGUAGES.SPANISH
      ? "ese día"
      : "that day"
    : effectiveDateLabel;
  const slotConfirmPhrase = formatSlotConfirmPhrase(
    {
      requestedTime: entities.requestedTime,
      dateLabel: dateLabelIsNeutral ? null : effectiveDateLabel
    },
    language
  );

  // BR-117 — rewrite Spanish templates that hard-code "el {dateLabel}" when day is unresolved.
  if (dateLabelIsNeutral && language === LANGUAGES.SPANISH) {
    template = String(template || "")
      .replace(
        /¿Te funciona el \{dateLabel\} a las \{requestedTime\}\?/g,
        "¿Te funciona a las {requestedTime}?"
      )
      .replace(
        /¿te funciona el \{dateLabel\} a las \{requestedTime\}\?/gi,
        "¿te funciona a las {requestedTime}?"
      )
      .replace(
        /¿El \{dateLabel\} a las \{requestedTime\} te funciona\?/g,
        "¿A las {requestedTime} te funciona?"
      )
      .replace(
        /Estaba confirmando el horario de la cita\. ¿Te funciona el \{dateLabel\} a las \{requestedTime\}\?/g,
        "Estaba confirmando el horario de la cita. ¿Te funciona a las {requestedTime}?"
      );
  }

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

  // Also apply earliestTime substitution for BR-087 / BR-105 templates.
  if (
    key === "acknowledge_known_availability" ||
    key === "acknowledge_known_availability_confirm_slot" ||
    key === "ask_time_after_constraint" ||
    key === "clarify_time_after_constraint" ||
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
    .replace(/\{slotConfirmPhrase\}/g, slotConfirmPhrase)
    .replace(/\{zoomUrl\}/g, zoomUrl)
    .replace(/\{city\}/g, city)
    .replace(/\{proposedStateName\}/g, proposed || "your state")
    .replace(/\{proposedState\}/g, entities.proposedState || "")
    .replace(/\{resumeQuestion\}/g, entities.resumeQuestion || "")
    .replace(/\{firstName\}/g, entities.firstName || "");

  const fallback = pack.safe_failure_escalate || pack.default;
  const sanitized = sanitizeCustomerCopy(rendered, fallback);
  // Implements BR-102 — do not stack equivalent acknowledgements in one reply.
  const text =
    sanitized === fallback
      ? sanitized
      : collapseRedundantAcknowledgements(sanitized);

  return {
    text,
    language,
    templateKey: key
  };
}

module.exports = {
  renderCustomerReply,
  formatRequestedTime,
  formatSlotConfirmPhrase,
  composeValuePropThenQualify,
  resolveResumeQuestion,
  collapseRedundantAcknowledgements,
  COPY
};
