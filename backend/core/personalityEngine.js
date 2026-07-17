function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

const { UNEMPLOYED_PATTERNS, matchesAny } = require("./languageLibrary");

const STUDENT_PATTERNS = [
  "student",
  "college",
  "university",
  "estudiante",
  "estudiando",
  "universidad"
];

const RETIRED_PATTERNS = [
  "retired",
  "retiree",
  "retirado",
  "retirada",
  "jubilado",
  "jubilada"
];

function isUnemployed(message, occupation) {
  const text = normalize(`${message} ${occupation || ""}`);
  return matchesAny(text, UNEMPLOYED_PATTERNS);
}

function isStudent(message, occupation) {
  const text = normalize(`${message} ${occupation || ""}`);
  return matchesAny(text, STUDENT_PATTERNS);
}

function isRetired(message, occupation) {
  const text = normalize(`${message} ${occupation || ""}`);
  return matchesAny(text, RETIRED_PATTERNS);
}

function hasPreviousPrimerica({ intent, memory, message }) {
  if (intent === "PRIMERICA") {
    return true;
  }

  const text = normalize(message);

  if (text.includes("primerica")) {
    return true;
  }

  return Boolean(memory?.lastObjection || memory?.notes?.toLowerCase?.().includes("primerica"));
}

function buildOccupationAcknowledgement(occupation, language) {
  void occupation;
  return language === "es" ? "Excelente." : "Great.";
}

function getPersonality({
  currentStep,
  intent,
  memory,
  leadStatus,
  occupation,
  language = "en",
  message,
  interviewType,
  schedulingState
} = {}) {
  const lang = language === "es" ? "es" : "en";
  const unemployed = isUnemployed(message, occupation);
  const student = isStudent(message, occupation);
  const retired = isRetired(message, occupation);
  const previousPrimerica = hasPreviousPrimerica({ intent, memory, message });

  if (previousPrimerica) {
    return {
      tone: "reconnecting",
      acknowledgement:
        lang === "es"
          ? "Gracias por volver a conectar con nosotros."
          : "Thanks for reconnecting with us.",
      transition: "",
      typingDelay: 1800,
      responseStyle: "warm",
      sensitiveContext: false
    };
  }

  if (retired) {
    return {
      tone: "respectful",
      acknowledgement: lang === "es" ? "Gracias." : "Thanks.",
      transition: "",
      typingDelay: 1700,
      responseStyle: "respectful",
      sensitiveContext: false
    };
  }

  if (student) {
    return {
      tone: "encouraging",
      acknowledgement: lang === "es" ? "Gracias." : "Thanks.",
      transition: "",
      typingDelay: 1600,
      responseStyle: "friendly",
      sensitiveContext: false
    };
  }

  if (unemployed) {
    return {
      tone: "empathetic",
      acknowledgement: lang === "es" ? "Entendido." : "Got it.",
      transition: "",
      typingDelay: 2200,
      responseStyle: "friendly",
      sensitiveContext: true
    };
  }

  if (currentStep === "OCCUPATION" && occupation) {
    return {
      tone: "encouraging",
      acknowledgement: buildOccupationAcknowledgement(occupation, lang),
      transition: "",
      typingDelay: 1800,
      responseStyle: "friendly",
      sensitiveContext: false
    };
  }

  if (currentStep === "INTERVIEW_TYPE") {
    return {
      tone: "encouraging",
      acknowledgement: lang === "es" ? "Perfecto." : "Great.",
      transition: "",
      typingDelay: 1600,
      responseStyle: "friendly",
      sensitiveContext: false
    };
  }

  if (currentStep === "SCHEDULE") {
    return {
      tone: "professional",
      acknowledgement: lang === "es" ? "Perfecto." : "Great.",
      transition: "",
      typingDelay: 1500,
      responseStyle: "professional",
      sensitiveContext: false
    };
  }

  if (currentStep === "EMAIL") {
    return {
      tone: "encouraging",
      acknowledgement: lang === "es" ? "Gracias." : "Thanks.",
      transition: "",
      typingDelay: 1500,
      responseStyle: "professional",
      sensitiveContext: false
    };
  }

  if (currentStep === "WORK_AUTHORIZATION") {
    return {
      tone: "professional",
      acknowledgement: lang === "es" ? "Perfecto." : "Perfect.",
      transition: "",
      typingDelay: 1500,
      responseStyle: "professional",
      sensitiveContext: false
    };
  }

  if (currentStep === "GREETING") {
    return {
      tone: "professional",
      acknowledgement: lang === "es" ? "Gracias." : "Thanks.",
      transition: "",
      typingDelay: 1500,
      responseStyle: "professional",
      sensitiveContext: false
    };
  }

  if (currentStep === "NEW") {
    return {
      tone: "professional",
      acknowledgement:
        lang === "es"
          ? "Hola. Soy Atlas, tu asistente virtual de Team Vision."
          : "Hi! I'm Atlas, your virtual recruiting assistant with Team Vision.",
      transition:
        lang === "es"
          ? "Te haré unas preguntas breves para agendar tu entrevista."
          : "I'll ask a few quick questions to schedule your interview.",
      typingDelay: 1200,
      responseStyle: "professional",
      sensitiveContext: false
    };
  }

  return {
    tone: "neutral",
    acknowledgement: lang === "es" ? "Entendido." : "Got it.",
    transition: "",
    typingDelay: 1500,
    responseStyle: "friendly",
    sensitiveContext: false
  };
}

module.exports = {
  getPersonality,
  isUnemployed,
  isStudent,
  isRetired
};
