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

/**
 * Implements BR-131 — natural greeting + one next qualification ask.
 * Location remains the next needed fact for a blank recruiting lead; do not
 * use this as a deflection when the prospect asked a substantive FAQ first.
 */
function getFirstMessage(language) {
  return language === "es"
    ? "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?"
    : "Hi! Thanks for reaching out. What city and state do you live in?";
}

/** Greeting acknowledgement only (no stacked questions). */
function getNaturalGreetingAck(language) {
  return language === "es"
    ? "¡Hola! Gracias por escribirnos."
    : "Hi! Thanks for reaching out.";
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

/**
 * BR-097 / BR-131 — concise human overview. Answer the ask; light compliance only.
 * Soft continuation question is appended by FAQ resume (one next missing fact).
 */
function getJobOverviewFaqAnswer(language) {
  return language === "es"
    ? "Es una oportunidad en servicios financieros: ayudas a familias con protección y planificación, con entrenamiento incluido. No es un empleo por hora garantizado."
    : "It's an opportunity in financial services — you help families with protection and planning, and training is included. It's not a guaranteed hourly job.";
}

/** BR-088 — explicit employment-framing ask (job/salaried/hourly). */
function getJobOpportunityFaqAnswer(language) {
  // Prefer concise Atlas copy over stale FAQ-catalog deferrals.
  return language === "es"
    ? "Es una oportunidad en servicios financieros (asesoría y distribución), no un empleo asalariado u por hora garantizado. No se requiere experiencia previa."
    : "This is an opportunity in financial services (advisory and distribution), not a guaranteed salaried or hourly job. No prior experience is required.";
}

function getInsuranceFaqAnswer(language) {
  return (
    findFAQ("is this insurance", language === "es" ? "es" : "en") ||
    getCanonicalFaqAnswer(language)
  );
}

/**
 * BR-099 / BR-137 — sales skill/experience/aversion + identity ("is this sales?").
 * Never claim "this is not sales" and never guarantee income/success.
 */
function getSalesObjectionFaqAnswer(language, kind = "skill") {
  const k = String(kind || "skill");
  if (k === "identity") {
    return language === "es"
      ? "Es una oportunidad de negocio en servicios financieros. Los representantes licenciados pueden ofrecer productos y servicios financieros, y una parte importante del trabajo es ayudar y educar a las familias. Entrenamiento y licencia forman parte del camino; no es un empleo tradicional de empleado."
      : "This is a financial-services business opportunity. Licensed representatives may offer financial products and services, and helping and educating families is a major part of the work. Training and licensing are part of the path — it isn't a traditional employee job.";
  }
  const aversion = k === "aversion";
  if (aversion) {
    return language === "es"
      ? "Entiendo. En la entrevista te explicamos el proceso con claridad para que puedas decidir con calma."
      : "I understand. During the interview we'll explain the process clearly so you can decide at your own pace.";
  }
  return language === "es"
    ? "No te preocupes, no necesitas saber vender para empezar. Recibes entrenamiento y aprendes el proceso paso a paso."
    : "You don't need sales experience to get started. Training is provided so you can learn the process step by step.";
}

/** BR-098 / BR-137 — experience FAQ (no acceptance/success promises). */
function getExperienceFaqAnswer(language) {
  return language === "es"
    ? "No necesitas experiencia previa en servicios financieros para explorar la oportunidad. Entrenamiento y licencia forman parte del proceso."
    : "Prior financial-services experience isn't required to explore the opportunity. Training and licensing are part of the process.";
}

/**
 * BR-137 — soft interview transition (one question). Does not book.
 * Optionally references a prospect-stated goal theme (never invented).
 */
function getSoftInterviewTransitionQuestion(language, prospectGoalTheme = null) {
  const theme = String(prospectGoalTheme || "").toLowerCase();
  if (theme === "flexibility") {
    return language === "es"
      ? "Como la flexibilidad te importa, el siguiente paso sería una entrevista corta para ver cómo funciona el camino de medio tiempo. ¿Prefieres en la mañana o en la tarde?"
      : "Since flexibility is important to you, the next step would be a short interview so you can see how the part-time path works. Do you prefer morning or afternoon?";
  }
  if (theme === "extra_income") {
    return language === "es"
      ? "Como te interesa el potencial de ingreso adicional, el siguiente paso sería una entrevista corta para entender cómo funciona la compensación. ¿Prefieres en la mañana o en la tarde?"
      : "Since extra income potential matters to you, the next step would be a short interview to see how compensation works. Do you prefer morning or afternoon?";
  }
  if (theme === "helping_families") {
    return language === "es"
      ? "Como te interesa ayudar a familias, el siguiente paso sería una entrevista corta para ver cómo se ve el trabajo en la práctica. ¿Prefieres en la mañana o en la tarde?"
      : "Since helping families matters to you, the next step would be a short interview so you can see how the work looks in practice. Do you prefer morning or afternoon?";
  }
  return language === "es"
    ? "Con lo que me has compartido, el siguiente paso sería una entrevista corta para que veas exactamente cómo funciona la oportunidad y puedas aclarar cualquier duda. ¿Prefieres en la mañana o en la tarde?"
    : "Based on what you've shared, the next step would be a short interview so you can see exactly how the opportunity works and ask any questions you still have. Do you prefer morning or afternoon?";
}

/** BR-137 — think-about-it clarification (no pressure). */
function getThinkAboutItClarifyQuestion(language) {
  return language === "es"
    ? "Claro. ¿Qué parte te gustaría pensar con más calma?"
    : "Of course. What part would you like to think through?";
}

/**
 * BR-137 — think-about-it when already qualified: soft interview offer as the one question.
 */
function getThinkAboutItInterviewOffer(language) {
  return language === "es"
    ? "Sin presión. Si te ayuda, una entrevista corta es una buena forma de aclarar dudas con calma. ¿Prefieres en la mañana o en la tarde?"
    : "No pressure. If it helps, a short interview is a calm way to get your remaining questions answered. Do you prefer morning or afternoon?";
}

/** BR-137 — legitimacy / scam skepticism (no fabricated ratings). */
function getLegitimacyTrustFaqAnswer(language) {
  return language === "es"
    ? "Entiendo la precaución. Es una oportunidad real de servicios financieros con entrenamiento y requisitos de licencia; no inventamos cifras ni promesas. La entrevista es el mejor lugar para hacer preguntas detalladas."
    : "I understand wanting to be careful. This is a real financial-services opportunity with training and licensing requirements — we don't invent ratings or guarantees. The interview is a good place to ask detailed questions.";
}

/**
 * BR-137 — don't want to recruit: truthful, brief; do not deny recruiting exists.
 */
function getRecruitRoleObjectionFaqAnswer(language) {
  return language === "es"
    ? "Entiendo. El modelo puede incluir desarrollo de equipo con el tiempo, pero no es lo único del trabajo: también hay atención a familias y servicios financieros con entrenamiento. No tienes que decidir eso de inmediato."
    : "Understood. The model can include team development over time, but that isn't the whole job — helping families with financial services and training are central too. You don't have to decide that up front.";
}

/** BR-137 — acknowledge captured prospect goal, then one continue question. */
function getProspectGoalAck(language, theme = "other") {
  const t = String(theme || "other");
  if (t === "flexibility") {
    return language === "es"
      ? "Entendido — la flexibilidad te importa."
      : "Got it — flexibility matters to you.";
  }
  if (t === "extra_income") {
    return language === "es"
      ? "Entendido — te interesa el potencial de ingreso adicional."
      : "Got it — you're interested in extra income potential.";
  }
  if (t === "business_ownership") {
    return language === "es"
      ? "Entendido — te interesa el camino de negocio propio."
      : "Got it — business ownership is what you're exploring.";
  }
  if (t === "helping_families") {
    return language === "es"
      ? "Entendido — te motiva ayudar a familias."
      : "Got it — helping families is important to you.";
  }
  if (t === "career_change") {
    return language === "es"
      ? "Entendido — estás evaluando un cambio de carrera."
      : "Got it — you're evaluating a career change.";
  }
  if (t === "learning_finance") {
    return language === "es"
      ? "Entendido — te interesa aprender conceptos financieros."
      : "Got it — you're interested in learning financial concepts.";
  }
  if (t === "leadership_growth") {
    return language === "es"
      ? "Entendido — te interesa el crecimiento y liderazgo."
      : "Got it — growth and leadership matter to you.";
  }
  return language === "es"
    ? "Gracias — eso me ayuda a orientarte mejor."
    : "Thanks — that helps me point you in the right direction.";
}

/**
 * BR-103 — network / prospecting objection.
 * Do not promise leads, clients, or guaranteed success.
 */
function getNetworkObjectionFaqAnswer(language) {
  return language === "es"
    ? "Eso se puede aprender y desarrollar con entrenamiento. No necesitas tener una gran red de contactos para comenzar."
    : "That's something you can learn and develop with training. You don't need a huge network of contacts to get started.";
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

/**
 * Implements BR-104 — progressive compensation FAQ (no income guarantees / invented amounts).
 * @param {"es"|"en"} language
 * @param {string} [detailKind]
 */
function getCompensationFaqAnswer(language, detailKind = "general") {
  const es = language === "es";
  const kind = String(detailKind || "general").toLowerCase();

  // Implements BR-105 — direct yes/no where canonical FAQ supports production-based pay.
  // Source: backend/knowledge/faq.json (production / not hourly / not guaranteed salary).
  if (kind === "commission" || kind === "commission_question") {
    return es
      ? "Sí. La compensación es basada en producción y depende de tu nivel de contrato; no es un sueldo fijo."
      : "Yes. Compensation is production-based and depends on your contract level; it isn't a fixed salary.";
  }
  if (kind === "hourly" || kind === "hourly_pay_question") {
    return es
      ? "No. No hay una tarifa por hora garantizada. En la entrevista te explican cómo funciona la compensación."
      : "No. There isn't a guaranteed hourly rate. The interview explains how compensation works.";
  }
  if (kind === "fixed_pay" || kind === "fixed_pay_question") {
    return es
      ? "No. No es un pago fijo garantizado. La compensación depende de la producción y del nivel de contrato."
      : "No. It isn't guaranteed fixed pay. Compensation depends on production and contract level.";
  }
  if (kind === "salary" || kind === "salary_question") {
    return es
      ? "No. No es un salario fijo garantizado. La compensación depende de la producción y del nivel de contrato."
      : "No. It isn't a guaranteed fixed salary. Compensation depends on production and contract level.";
  }
  if (kind === "how_much") {
    // Implements BR-137 — prefer explicit non-guarantee copy over catalog phrasing.
    return es
      ? "No es un rol con sueldo fijo. La compensación depende de la actividad con licencia/productos y de la estructura aplicable; los detalles actuales se cubren mejor en la entrevista."
      : "This isn't a salaried employee role. Compensation depends on licensed/product activity and the applicable compensation structure; current details are best covered in the interview.";
  }
  if (kind === "pay_how" || kind === "source") {
    // Implements BR-106 — direct pay-mechanics answer (not bare Continuemos / interview-only evasion).
    return es
      ? "La compensación es basada en producción y depende de tu nivel de contrato; no es un salario fijo por hora."
      : "Compensation is production-based and depends on your contract level; it isn't fixed hourly pay.";
  }

  // Broad "cómo voy a ganar dinero" / "how do I make money"
  return es
    ? "La compensación depende de la producción y del nivel de contrato; no es un sueldo por hora garantizado. En la entrevista te explican cómo funciona."
    : "Compensation depends on production and contract level; it isn't guaranteed hourly pay. The details are explained during the interview.";
}

/** BR-090 — first acknowledgement of fixed/salaried employment preference (no pressure). */
function getFixedEmploymentPreferenceMessage(language) {
  return language === "es"
    ? "Entiendo. Esta oportunidad no es un empleo con sueldo fijo garantizado. Algunas personas la evalúan de forma adicional a su trabajo actual, pero depende de lo que estés buscando."
    : "I understand. This opportunity is not a guaranteed salaried or hourly position. Some people evaluate it alongside their current job, but it depends on what you're looking for.";
}

/** BR-090 — polite terminal closure for current non-fit (not opt-out). */
function getCurrentNotFitClosureMessage(language) {
  return language === "es"
    ? "Entiendo. Si en algún momento te interesa conocer esta oportunidad, puedes escribirnos por aquí. Te deseo mucho éxito en tu búsqueda."
    : "I understand. If you'd like to learn about this opportunity later, you can write us here. I wish you every success in your search.";
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
  getNaturalGreetingAck,
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
  getJobOverviewFaqAnswer,
  getJobOpportunityFaqAnswer,
  getInsuranceFaqAnswer,
  getExperienceFaqAnswer,
  getSalesObjectionFaqAnswer,
  getNetworkObjectionFaqAnswer,
  getSoftInterviewTransitionQuestion,
  getThinkAboutItClarifyQuestion,
  getThinkAboutItInterviewOffer,
  getLegitimacyTrustFaqAnswer,
  getRecruitRoleObjectionFaqAnswer,
  getProspectGoalAck,
  getLicenseRequirementFaqAnswer,
  getLicensePathKnowledge,
  getLicensePathDetailFaqAnswer,
  looksLikeLicensePathDetailQuestion,
  getCompensationFaqAnswer,
  getFixedEmploymentPreferenceMessage,
  getCurrentNotFitClosureMessage,
  getClarifyLicenseTypeMessage,
  getClarifyWorkAuthAfterLicenseMessage,
  getOutsideZoomDayPartMessage,
  buildBookingConfirmation
};
