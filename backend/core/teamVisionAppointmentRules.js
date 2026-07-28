/**
 * Sprint 22.1 — Team Vision Zoom-first appointment conversation rules.
 * Atlas handles the standard process; the agent handles exceptions.
 */

const TEAM_VISION_PROMPTS = Object.freeze({
  ZOOM_INTRO_ES: "Estamos realizando las entrevistas por Zoom.",
  ZOOM_INTRO_EN: "We're conducting interviews via Zoom.",
  SCHEDULING_PREFERENCE_ES:
    "Estamos realizando las entrevistas por Zoom. ¿Prefieres en la mañana o en la tarde?",
  SCHEDULING_PREFERENCE_EN:
    "We're conducting interviews via Zoom. Do you prefer morning or afternoon?",
  LOCAL_INTERVIEW_CHOICE_ES:
    "Como estás en nuestra área local, podemos realizar la entrevista en nuestra oficina o por Zoom. ¿Cuál prefieres?",
  LOCAL_INTERVIEW_CHOICE_EN:
    "Since you are in our local area, we can conduct the interview in our office or by Zoom. Which do you prefer?",
  OUTSIDE_AREA_ZOOM_ES:
    "Como estás fuera de nuestra área local, realizaremos la entrevista por Zoom.",
  OUTSIDE_AREA_ZOOM_EN:
    "Since you are outside our local area, we will conduct the interview via Zoom.",
  ZOOM_EXPLAIN_ES:
    "Zoom es gratis y funciona en tu teléfono o computadora. Te envío las instrucciones para descargarlo.",
  ZOOM_EXPLAIN_EN:
    "Zoom is free and works on your phone or computer. I'll send download instructions.",
  HUMAN_ASSIST_ES:
    "Entiendo. Un miembro de nuestro equipo te ayudará para encontrar la mejor forma de realizar la entrevista.",
  HUMAN_ASSIST_EN:
    "I understand. A member of our team will help you find the best way to conduct the interview.",
  EMAIL_COLLECTION_ES:
    "Perfecto, para enviarte la confirmación de la entrevista y el enlace de Zoom, ¿me compartes tu correo electrónico?",
  EMAIL_COLLECTION_EN:
    "Great — to send your interview confirmation and Zoom link, may I have your email address?"
});

const HUMAN_ASSIST_TRIGGERS = Object.freeze([
  "zoom_install_failed",
  "zoom_access_failed",
  "unusual_meeting_method",
  "prospect_requests_agent",
  "reschedule_failed",
  "low_ai_confidence",
  "missing_judgment_info",
  "in_person_requested",
  "outside_scheduling_window"
]);

const ZOOM_FAILURE_PATTERNS = [
  "no puedo instalar zoom",
  "no puedo descargar zoom",
  "zoom no funciona",
  "zoom no abre",
  "no tengo zoom",
  "no me deja entrar",
  "cannot install zoom",
  "can't install zoom",
  "zoom doesn't work",
  "zoom doesnt work",
  "zoom not working",
  "no access to zoom",
  "no tengo acceso a zoom"
];

const UNUSUAL_MEETING_PATTERNS = [
  "google meet",
  "whatsapp video",
  "whatsapp llamada",
  "videollamada de whatsapp",
  "teams",
  "microsoft teams",
  "facetime",
  "skype",
  "webex",
  "llamada telefonica",
  "phone call only",
  "presencial",
  "in person",
  "in-person",
  "oficina",
  "office visit",
  "en persona"
];

const AGENT_REQUEST_PATTERNS = [
  "hablar con alguien",
  "hablar con un agente",
  "hablar con una persona",
  "speak to someone",
  "speak with an agent",
  "talk to a person",
  "real person",
  "agente real"
];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function detectZoomFailure(message) {
  return matchesAny(normalizeText(message), ZOOM_FAILURE_PATTERNS);
}

function detectUnusualMeetingRequest(message) {
  return matchesAny(normalizeText(message), UNUSUAL_MEETING_PATTERNS);
}

function detectAgentRequest(message) {
  return matchesAny(normalizeText(message), AGENT_REQUEST_PATTERNS);
}

function detectSchedulingEscalation(message) {
  if (detectZoomFailure(message)) {
    return { escalate: true, reason: "zoom_access_failed" };
  }

  if (detectUnusualMeetingRequest(message)) {
    return { escalate: true, reason: "unusual_meeting_method" };
  }

  if (detectAgentRequest(message)) {
    return { escalate: true, reason: "prospect_requests_agent" };
  }

  return { escalate: false, reason: null };
}

function shouldEscalateToHuman(reason) {
  return HUMAN_ASSIST_TRIGGERS.includes(reason);
}

function buildHumanAssistSummary(reason, context = {}) {
  const summaries = {
    zoom_install_failed: "Prospect cannot install Zoom",
    zoom_access_failed: "Prospect cannot access Zoom",
    unusual_meeting_method: "Prospect requested non-standard meeting method",
    prospect_requests_agent: "Prospect asked to speak with an agent",
    in_person_requested: "Prospect requested in-person interview",
    reschedule_failed: "Automatic rescheduling could not complete",
    low_ai_confidence: "AI confidence too low for scheduling decision",
    missing_judgment_info: "Missing information requiring agent judgment",
    outside_scheduling_window: "Requested time outside scheduling window"
  };

  const base = summaries[reason] || "Appointment exception requires agent review";

  if (context.prospectPhone) {
    return `${base} (${context.prospectPhone})`;
  }

  return base;
}

function getOutsideAreaZoomIntro(language) {
  return language === "es"
    ? TEAM_VISION_PROMPTS.OUTSIDE_AREA_ZOOM_ES
    : TEAM_VISION_PROMPTS.OUTSIDE_AREA_ZOOM_EN;
}

function getLocalInterviewChoiceQuestion(language) {
  return language === "es"
    ? TEAM_VISION_PROMPTS.LOCAL_INTERVIEW_CHOICE_ES
    : TEAM_VISION_PROMPTS.LOCAL_INTERVIEW_CHOICE_EN;
}

function getZoomIntro(language) {
  return language === "es" ? TEAM_VISION_PROMPTS.ZOOM_INTRO_ES : TEAM_VISION_PROMPTS.ZOOM_INTRO_EN;
}

function getPeriodPreferenceQuestion(language) {
  return language === "es"
    ? TEAM_VISION_PROMPTS.SCHEDULING_PREFERENCE_ES
    : TEAM_VISION_PROMPTS.SCHEDULING_PREFERENCE_EN;
}

function getEmailCollectionQuestion(language) {
  return language === "es"
    ? TEAM_VISION_PROMPTS.EMAIL_COLLECTION_ES
    : TEAM_VISION_PROMPTS.EMAIL_COLLECTION_EN;
}

function getHumanAssistReply(language) {
  return language === "es"
    ? TEAM_VISION_PROMPTS.HUMAN_ASSIST_ES
    : TEAM_VISION_PROMPTS.HUMAN_ASSIST_EN;
}

module.exports = {
  TEAM_VISION_PROMPTS,
  HUMAN_ASSIST_TRIGGERS,
  shouldEscalateToHuman,
  buildHumanAssistSummary,
  detectZoomFailure,
  detectUnusualMeetingRequest,
  detectAgentRequest,
  detectSchedulingEscalation,
  getZoomIntro,
  getOutsideAreaZoomIntro,
  getLocalInterviewChoiceQuestion,
  getPeriodPreferenceQuestion,
  getEmailCollectionQuestion,
  getHumanAssistReply
};
