/**
 * Sprint 21.4 — Canonical Team Vision recruiting workflow copy.
 * Implements BR-018, BR-019, BR-020, BR-021.
 * Office strings always come from BR-018 fullAddress (includes suite) — BR-077.
 */

const { getOfficeLocation } = require("./businessRulesEngine");
const { findFAQ } = require("./faqEngine");

function getCanonicalOfficeAddress() {
  return getOfficeLocation().fullAddress;
}

/** @deprecated Prefer getCanonicalOfficeAddress(); kept for call-site compatibility. */
const OFFICE_ADDRESS = getCanonicalOfficeAddress();

function getFirstMessage(language) {
  return language === "es"
    ? "Hola, ¿en qué ciudad y estado vives?"
    : "Hi! What city and state do you live in?";
}

function getStateQuestion(city, language, options = {}) {
  const proposedState = options.proposedState || null;
  if (city && proposedState === "FL") {
    return language === "es"
      ? `Perfecto. ¿${city}, Florida?`
      : `Perfect. ${city}, Florida?`;
  }
  if (city && proposedState) {
    return language === "es"
      ? `Perfecto. ¿${city}, ${proposedState}?`
      : `Perfect. ${city}, ${proposedState}?`;
  }
  return language === "es"
    ? `¿En qué estado está ${city}?`
    : `Which state is ${city} in?`;
}

function getAuthorizationQuestion(language) {
  return language === "es"
    ? "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
    : "Do you have work authorization or legal documentation to work in the United States?";
}

function getAuthorizationDeniedMessage(language) {
  return language === "es"
    ? "Gracias por tu interés. En este momento necesitamos contar con autorización legal vigente para trabajar en Estados Unidos. Cuando cuentes con la documentación requerida, con gusto podemos retomar el proceso."
    : "Thank you for your interest. At this time we need current legal authorization to work in the United States. When you have the required documentation, we'd be happy to continue the process.";
}

function getLocalOfficeDayPartMessage(language) {
  const officeAddress = getCanonicalOfficeAddress();
  return language === "es"
    ? `Excelente. Estamos realizando las entrevistas en nuestras oficinas ubicadas en ${officeAddress}. ¿Prefieres en la mañana o en la tarde?`
    : `Excellent. We're conducting interviews at our offices located at ${officeAddress}. Do you prefer morning or afternoon?`;
}

function getRemoteZoomDayPartMessage(language) {
  return language === "es"
    ? "Excelente. Estamos realizando las entrevistas por Zoom. ¿Prefieres en la mañana o en la tarde?"
    : "Excellent. We're conducting interviews via Zoom. Do you prefer morning or afternoon?";
}

function getLocalZoomSwitchMessage(language) {
  return language === "es"
    ? "Perfecto. También podemos realizar la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?"
    : "Perfect. We can also conduct the interview via Zoom. Do you prefer morning or afternoon?";
}

function getNameQuestion(language) {
  return language === "es"
    ? "¿Cuál es tu nombre completo?"
    : "What is your full name?";
}

function getEmailCollectionQuestion(language) {
  return language === "es"
    ? "¿Cuál es tu correo electrónico para enviarte la confirmación de la entrevista?"
    : "What is your email address so we can send your interview confirmation?";
}

function getDayPartQuestion(language) {
  return language === "es"
    ? "¿Prefieres en la mañana o en la tarde?"
    : "Do you prefer morning or afternoon?";
}

/** BR-082 — alternate day-part clarification (avoid identical loop). */
function getDayPartClarificationQuestion(language, attempt = 1) {
  if (Number(attempt) >= 2) {
    return language === "es"
      ? "Sin problema. Responde mañana o tarde para continuar."
      : "No problem. Please reply morning or afternoon so we can continue.";
  }
  return language === "es"
    ? "No te entendí bien — ¿prefieres en la mañana o en la tarde?"
    : "I didn't catch that — do you prefer morning or afternoon?";
}

function getHandoffMessage(language) {
  return language === "es"
    ? "Quiero asegurarme de darte la información correcta. Permíteme conectarte con uno de nuestros líderes para ayudarte personalmente."
    : "I want to make sure you get the right information. Let me connect you with one of our leaders to help you personally.";
}

function getCanonicalFaqAnswer(language) {
  return language === "es"
    ? "Trabajamos en la asesoría y distribución de servicios financieros. No se requiere experiencia y durante la entrevista te darán más detalles."
    : "We work in financial advisory and distribution services. No experience is required, and you'll learn more during the interview.";
}

/** BR-088 — job/employment/opportunity (not a guaranteed salaried/hourly job). */
function getJobOpportunityFaqAnswer(language) {
  return (
    findFAQ("is this a job", language === "es" ? "es" : "en") ||
    findFAQ("what is the job", language === "es" ? "es" : "en") ||
    (language === "es"
      ? "Es una oportunidad en servicios financieros (asesoría y distribución), no un empleo asalariado u por hora garantizado. No se requiere experiencia; en la entrevista te explican cómo funciona para que decidas si te conviene."
      : "This is an opportunity in financial services (advisory and distribution), not a guaranteed salaried or hourly job. No experience is required; during the interview you'll learn how it works so you can decide if it's a good fit.")
  );
}

function getInsuranceFaqAnswer(language) {
  return (
    findFAQ("is this insurance", language === "es" ? "es" : "en") ||
    getCanonicalFaqAnswer(language)
  );
}

function getLicenseRequirementFaqAnswer(language) {
  // BR-089 — ordinary requirement FAQ stays simple; never volunteer 2-14/2-15.
  return (
    findFAQ("do I need a license", language === "es" ? "es" : "en") ||
    (language === "es"
      ? "Como es una profesión licenciada, todos realizan un curso de licencia. Durante la entrevista te explicarán cómo funciona el proceso y cómo te acompañaremos en cada paso."
      : "Since it's a licensed profession, everyone completes a licensing course. During the interview we'll explain how the process works and how we'll help you through it.")
  );
}

/**
 * BR-089 — Florida Team Vision licensing path background (2-14 primary, 2-15 fallback).
 * Only for explicit path/detail questions — not ordinary "do I need a license?".
 */
function getLicensePathKnowledge() {
  return require("../knowledge/teamVisionLicensePath.json");
}

function getLicensePathDetailFaqAnswer(language) {
  const knowledge = getLicensePathKnowledge();
  if (language === "es") {
    return knowledge.response_es;
  }
  return knowledge.response_en;
}

/**
 * Prospect is asking which license / 2-14 vs 2-15 / what if they don't pass / path details.
 */
function looksLikeLicensePathDetailQuestion(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) {
    return false;
  }
  return (
    /\b(2[- ]?14|2[- ]?15|214|215)\b/.test(t) ||
    /\b(cual licencia|que licencia|which license|what license)\b/.test(t) ||
    /\b(2[- ]?14\s*(vs|versus|o|or)\s*2[- ]?15)\b/.test(t) ||
    /\b(que pasa si no (paso|apruebo)|y si no (paso|apruebo)|si no paso la licencia)\b/.test(
      t
    ) ||
    /\b(what if i (don'?t|do not) (pass|make it)|what happens if i (fail|don'?t pass))\b/.test(
      t
    ) ||
    /\b(camino de licencia|licensing path|license path|ruta de licencia)\b/.test(
      t
    ) ||
    /\bque licencia (hay|tengo) que sacar\b/.test(t) ||
    /\bwhat license do i need\b/.test(t) ||
    /\bdo i need a 215\b/.test(t) ||
    /\bdo i need a 214\b/.test(t)
  );
}

function getCompensationFaqAnswer(language) {
  return (
    findFAQ("how much does it pay", language === "es" ? "es" : "en") ||
    (language === "es"
      ? "No es un trabajo por hora. Durante la entrevista te explicarán cómo funciona la compensación, responderán tus preguntas y podrás decidir si es una buena oportunidad para ti."
      : "This isn't an hourly position. During the interview we'll explain how the compensation works, answer your questions, and you can decide if it's a good fit for you.")
  );
}

/** BR-083 — generic “tengo licencia” is ambiguous (often driver's license). */
function getClarifyLicenseTypeMessage(language) {
  return language === "es"
    ? "¿Te refieres a una licencia profesional de seguros o servicios financieros, o a la licencia de conducir?"
    : "Do you mean a professional insurance/financial-services license, or a driver's license?";
}

function getClarifyWorkAuthAfterLicenseMessage(language) {
  return language === "es"
    ? "Perfecto, gracias. Por separado, ¿tienes autorización legal o documentación para trabajar en Estados Unidos?"
    : "Got it, thanks. Separately, do you have legal authorization or documentation to work in the United States?";
}

function getOutsideZoomDayPartMessage(city, language) {
  const place = city || (language === "es" ? "tu área" : "your area");
  return language === "es"
    ? `Como estás en ${place}, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?`
    : `Since you're in ${place}, we can do the interview by Zoom. Do you prefer morning or afternoon?`;
}

function buildBookingConfirmation({ interviewType, slotLabel, language }) {
  const isZoom = String(interviewType || "").toLowerCase().includes("zoom");
  const officeAddress = getCanonicalOfficeAddress();

  if (language === "es") {
    if (isZoom) {
      return `Listo, quedaste programado para ${slotLabel} por Zoom. Te enviaremos el enlace 30 minutos antes para conectarte.`;
    }

    return `Listo, quedaste programado para ${slotLabel} en nuestras oficinas (${officeAddress}).`;
  }

  if (isZoom) {
    return `You're all set for ${slotLabel} via Zoom. We'll send the link 30 minutes before your interview.`;
  }

  return `You're all set for ${slotLabel} at our office (${officeAddress}).`;
}

module.exports = {
  OFFICE_ADDRESS,
  getCanonicalOfficeAddress,
  getFirstMessage,
  getStateQuestion,
  getAuthorizationQuestion,
  getAuthorizationDeniedMessage,
  getLocalOfficeDayPartMessage,
  getRemoteZoomDayPartMessage,
  getLocalZoomSwitchMessage,
  getNameQuestion,
  getEmailCollectionQuestion,
  getDayPartQuestion,
  getDayPartClarificationQuestion,
  getHandoffMessage,
  getCanonicalFaqAnswer,
  getJobOpportunityFaqAnswer,
  getInsuranceFaqAnswer,
  getLicenseRequirementFaqAnswer,
  getLicensePathKnowledge,
  getLicensePathDetailFaqAnswer,
  looksLikeLicensePathDetailQuestion,
  getCompensationFaqAnswer,
  getClarifyLicenseTypeMessage,
  getClarifyWorkAuthAfterLicenseMessage,
  getOutsideZoomDayPartMessage,
  buildBookingConfirmation
};
