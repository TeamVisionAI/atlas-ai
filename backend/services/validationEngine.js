// Atlas Validation Engine v1

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
  
    const yesAnswers = [
      "yes",
      "y",
      "yeah",
      "yep",
      "si",
      "sí",
      "green card",
      "citizen",
      "citizenship",
      "work permit",
      "permit",
      "tps",
      "authorized",
      "autorizado",
      "autorizada"
    ];
  
    const noAnswers = [
      "no",
      "not yet",
      "nope",
      "not authorized",
      "sin permiso",
      "no tengo permiso",
      "no tengo papeles",
      "no tengo autorización",
      "no tengo autorizacion"
    ];
  
    const isYes = yesAnswers.some((value) => text.includes(value));
    const isNo = noAnswers.some((value) => text.includes(value));
  
    if (!isYes && !isNo) {
      return {
        valid: false,
        reason: "WORK_AUTHORIZATION_REQUIRED"
      };
    }
  
    return {
      valid: true,
      value: isYes
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
    const text = normalize(message);
  
    const validAnswers = [
      "1",
      "2",
      "in person",
      "in-person",
      "person",
      "office",
      "presencial",
      "zoom",
      "virtual",
      "online"
    ];
  
    const valid = validAnswers.some((value) => text.includes(value));
  
    if (!valid) {
      return {
        valid: false,
        reason: "INTERVIEW_TYPE_REQUIRED"
      };
    }
  
    return {
      valid: true
    };
  }
  
  function validateSchedule(message) {
    const text = normalize(message);
  
    const validAnswers = [
      "1",
      "2",
      "1:00",
      "1 pm",
      "1:00 pm",
      "5:00",
      "5 pm",
      "5:00 pm"
    ];
  
    const valid = validAnswers.some((value) => text.includes(value));
  
    if (!valid) {
      return {
        valid: false,
        reason: "SCHEDULE_REQUIRED"
      };
    }
  
    return {
      valid: true
    };
  }
  
  function validateAnswer(step, message) {
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
        return validateSchedule(message);
  
      default:
        return {
          valid: true
        };
    }
  }
  
  function getValidationReply(reason, language = "en") {
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
        en: "Please choose one option:\n\n1️⃣ In person\n\n2️⃣ On Zoom",
        es: "Por favor elige una opción:\n\n1️⃣ Presencial\n\n2️⃣ Por Zoom"
      },
  
      SCHEDULE_REQUIRED: {
        en: "Please choose one available time:\n\n1️⃣ 1:00 PM\n\n2️⃣ 5:00 PM",
        es: "Por favor elige uno de los horarios disponibles:\n\n1️⃣ 1:00 PM\n\n2️⃣ 5:00 PM"
      }
    };
  
    return replies[reason]?.[language] || replies[reason]?.en || null;
  }
  
  module.exports = {
    validateAnswer,
    getValidationReply
  };