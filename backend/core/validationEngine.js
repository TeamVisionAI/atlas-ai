const { isYes, isNo } = require("./languageLibrary");
const {
  getInterviewPreferenceQuestion,
  getScheduleQuestion,
  parseInterviewType,
  validateScheduleStep
} = require("./schedulingEngine");

function normalize(message) {
  return String(message || "")
    .trim()
    .toLowerCase();
}

function validateCityState(message) {
  const text = String(message || "").trim();

  if (!text || text.length < 3) {
    return {
      valid: false,
      reason: "CITY_REQUIRED"
    };
  }

  const invalidAnswers = [
    "hi",
    "hello",
    "hey",
    "hola",
    "info",
    "interested",
    "yes",
    "no",
    "ok",
    "okay",
    "primerica"
  ];

  if (invalidAnswers.includes(text.toLowerCase())) {
    return {
      valid: false,
      reason: "CITY_REQUIRED"
    };
  }

  const containsLetter = /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(text);

  if (!containsLetter) {
    return {
      valid: false,
      reason: "CITY_REQUIRED"
    };
  }

  return {
    valid: true
  };
}

function validateWorkAuthorization(message) {
  const text = normalize(message);
  const yes = isYes(text);
  const no = isNo(text);

  if (!yes && !no) {
    return {
      valid: false,
      reason: "WORK_AUTHORIZATION_REQUIRED"
    };
  }

  return {
    valid: true,
    value: yes
  };
}

function validateOccupation(message) {
  const text = String(message || "").trim();

  if (!text || text.length < 2) {
    return {
      valid: false,
      reason: "OCCUPATION_REQUIRED"
    };
  }

  const invalidAnswers = [
    "hi",
    "hello",
    "hey",
    "hola",
    "yes",
    "no",
    "ok",
    "okay",
    "info",
    "interested",
    "primerica"
  ];

  if (invalidAnswers.includes(text.toLowerCase())) {
    return {
      valid: false,
      reason: "OCCUPATION_REQUIRED"
    };
  }

  return {
    valid: true
  };
}

function validateInterviewType(message) {
  const interviewType = parseInterviewType(message);

  if (!interviewType) {
    return {
      valid: false,
      reason: "INTERVIEW_TYPE_REQUIRED"
    };
  }

  return {
    valid: true,
    value: interviewType
  };
}

function validateEmail(message) {
  const text = String(message || "").trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(text)) {
    return {
      valid: false,
      reason: "EMAIL_REQUIRED"
    };
  }

  return {
    valid: true,
    value: text
  };
}

function validateAnswer(step, message, context = {}) {
  switch (step) {
    case "GREETING":
      return validateCityState(message);

    case "WORK_AUTHORIZATION":
      return validateWorkAuthorization(message);

    case "OCCUPATION":
      return validateOccupation(message);

    case "INTERVIEW_TYPE":
      return validateInterviewType(message);

    case "SCHEDULE":
      return validateScheduleStep(message, context);

    case "EMAIL":
      return validateEmail(message);

    default:
      return {
        valid: true
      };
  }
}

function getRecoveryReply(step, language = "en", context = {}) {
  const replies = {
    GREETING: {
      en: "I understand.\n\nWhenever you're ready, what city and state do you currently live in?",
      es: "Entiendo.\n\nCuando puedas, ¿en qué ciudad y estado vives actualmente?"
    },
    WORK_AUTHORIZATION: {
      en: "I understand.\n\nWhenever you're ready, could you confirm whether you currently have work authorization in the United States?",
      es: "Entiendo.\n\nCuando puedas, ¿podrías confirmar si actualmente tienes autorización de trabajo en los Estados Unidos?"
    },
    OCCUPATION: {
      en: "I understand.\n\nWhenever you're ready, what do you currently do for work?",
      es: "Entiendo.\n\nCuando puedas, ¿en qué trabajas actualmente?"
    },
    INTERVIEW_TYPE: {
      en: `I understand.\n\nWhenever you're ready:\n\n${getInterviewPreferenceQuestion("en")}`,
      es: `Entiendo.\n\nCuando puedas:\n\n${getInterviewPreferenceQuestion("es")}`
    },
    SCHEDULE: {
      en: `I understand.\n\nWhenever you're ready:\n\n${getScheduleQuestion(context.schedulingState || { phase: "DAY" }, context.interviewType, "en")}`,
      es: `Entiendo.\n\nCuando puedas:\n\n${getScheduleQuestion(context.schedulingState || { phase: "DAY" }, context.interviewType, "es")}`
    },
    EMAIL: {
      en: "I understand.\n\nWhenever you're ready, what is the best email address to send your interview confirmation?",
      es: "Entiendo.\n\nCuando puedas, ¿cuál es el mejor correo electrónico para enviarte la confirmación de tu entrevista?"
    }
  };

  return replies[step]?.[language] || replies[step]?.en || null;
}

function getValidationReply(reason, language = "en", context = {}) {
  const scheduleQuestion = getScheduleQuestion(
    context.schedulingState || { phase: "DAY", offeredDays: [] },
    context.interviewType,
    language
  );

  const replies = {
    CITY_REQUIRED: {
      en: "I didn't catch your location. What city and state do you currently live in? For example: Miami, FL.",
      es: "No pude identificar tu ubicación. ¿En qué ciudad y estado vives actualmente? Por ejemplo: Miami, FL."
    },

    WORK_AUTHORIZATION_REQUIRED: {
      en: "Please confirm whether you currently have legal authorization to work in the United States.",
      es: "Por favor confirma si actualmente tienes autorización legal para trabajar en los Estados Unidos."
    },

    OCCUPATION_REQUIRED: {
      en: "What do you currently do for work? You can share your occupation or the type of work you do.",
      es: "¿En qué trabajas actualmente? Puedes compartir tu ocupación o el tipo de trabajo que realizas."
    },

    INTERVIEW_TYPE_REQUIRED: {
      en: getInterviewPreferenceQuestion("en"),
      es: getInterviewPreferenceQuestion("es")
    },

    SCHEDULE_DAY_REQUIRED: {
      en: scheduleQuestion,
      es: scheduleQuestion
    },

    SCHEDULE_PERIOD_REQUIRED: {
      en: scheduleQuestion,
      es: scheduleQuestion
    },

    SCHEDULE_TIME_REQUIRED: {
      en: scheduleQuestion,
      es: scheduleQuestion
    },

    SCHEDULE_REQUIRED: {
      en: scheduleQuestion,
      es: scheduleQuestion
    },

    EMAIL_REQUIRED: {
      en: "Please share a valid email address so we can send your interview confirmation.",
      es: "Por favor comparte un correo electrónico válido para enviarte la confirmación de tu entrevista."
    }
  };

  return replies[reason]?.[language] || replies[reason]?.en || null;
}

module.exports = {
  validateAnswer,
  getValidationReply,
  getRecoveryReply
};
