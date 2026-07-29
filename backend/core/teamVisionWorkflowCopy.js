/**
 * Sprint 21.4 — Canonical Team Vision recruiting workflow copy.
 * Implements BR-018, BR-019, BR-020, BR-021.
 */

const OFFICE_ADDRESS = "2500 NW 79th Ave, Miami, Florida";

function getFirstMessage(language) {
  return language === "es"
    ? "Hola, ¿en qué ciudad y estado vives?"
    : "Hi! What city and state do you live in?";
}

function getStateQuestion(city, language) {
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
  return language === "es"
    ? `Excelente. Estamos realizando las entrevistas en nuestras oficinas ubicadas en ${OFFICE_ADDRESS}. ¿Prefieres en la mañana o en la tarde?`
    : `Excellent. We're conducting interviews at our offices located at ${OFFICE_ADDRESS}. Do you prefer morning or afternoon?`;
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

function buildBookingConfirmation({ interviewType, slotLabel, language }) {
  const isZoom = String(interviewType || "").toLowerCase().includes("zoom");

  if (language === "es") {
    if (isZoom) {
      return `Listo, quedaste programado para ${slotLabel} por Zoom. Te enviaremos el enlace 30 minutos antes para conectarte.`;
    }

    return `Listo, quedaste programado para ${slotLabel} en nuestras oficinas (${OFFICE_ADDRESS}).`;
  }

  if (isZoom) {
    return `You're all set for ${slotLabel} via Zoom. We'll send the link 30 minutes before your interview.`;
  }

  return `You're all set for ${slotLabel} at our office (${OFFICE_ADDRESS}).`;
}

module.exports = {
  OFFICE_ADDRESS,
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
  getHandoffMessage,
  getCanonicalFaqAnswer,
  buildBookingConfirmation
};
