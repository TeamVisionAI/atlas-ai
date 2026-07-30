const { isYes, isNo, matchesAny, isScheduleConfirmation } = require("./languageLibrary");
const { detectScheduleOverride } = require("./scheduleLanguageParser");
const { INTERVIEW_TYPES } = require("./interviewScheduling");

const US_STATE_NAMES = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY"
};

const CITY_TO_STATE = {
  tampa: "FL",
  miami: "FL",
  orlando: "FL",
  doral: "FL",
  jacksonville: "FL",
  "fort lauderdale": "FL",
  tallahassee: "FL",
  "st petersburg": "FL",
  "saint petersburg": "FL",
  hialeah: "FL",
  atlanta: "GA",
  houston: "TX",
  dallas: "TX",
  "san antonio": "TX",
  austin: "TX",
  phoenix: "AZ",
  charlotte: "NC",
  "new york": "NY",
  brooklyn: "NY",
  chicago: "IL",
  "los angeles": "CA",
  "san diego": "CA"
};

const AUTHORIZATION_PATTERNS = [
  "residency",
  "residence",
  "green card",
  "citizen",
  "citizenship",
  "work permit",
  "work authorization",
  "authorized to work",
  "legal status",
  "tps",
  "usc",
  "permiso de trabajo",
  "autorizacion de trabajo",
  "autorización de trabajo",
  "residencia",
  "ciudadania",
  "ciudadanía"
];

const OCCUPATION_PATTERNS = [
  /(?:i work at|i work for|work at|work for|employed at|employed by)\s+([^,.!?]+)/i,
  /(?:i'?m a|i am a|soy)\s+([^,.!?]+)/i,
  /(?:my job is|my work is)\s+([^,.!?]+)/i,
  /(?:trabajo en|trabajo como)\s+([^,.!?]+)/i
];

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function normalizeState(value) {
  const text = normalize(value);

  if (/^[a-z]{2}$/.test(text)) {
    return text.toUpperCase();
  }

  return US_STATE_NAMES[text] || value;
}

function trimAtClause(value) {
  if (!value) {
    return value;
  }

  return String(value)
    .split(/\s+(?:and|but|y|pero|with|con|who|that|which)\s+/i)[0]
    .trim();
}

function inferStateFromCity(city) {
  if (!city) {
    return null;
  }

  return CITY_TO_STATE[normalize(city)] || null;
}

function isGreetingOrSmallTalk(text) {
  const normalized = normalize(text);

  return (
    /^(hola|hello|hi|hey|buenos dias|buenas|good morning|good afternoon)\b/i.test(normalized) ||
    /\b(información|informacion|information|team vision|quisiera|want to know|tell me about|quiero información|quiero informacion)\b/i.test(
      normalized
    )
  );
}

function isValidCityName(value) {
  if (!value) {
    return false;
  }

  const text = String(value).trim();

  if (text.length > 40) {
    return false;
  }

  if (isGreetingOrSmallTalk(text) || isLikelyQuestion(text)) {
    return false;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount > 4) {
    return false;
  }

  if (/[?!]/.test(text)) {
    return false;
  }

  return /^[A-Za-zÀ-ÿ'.\-\s]+$/.test(text);
}

function parseCityStateTokens(locationText) {
  const location = trimAtClause(String(locationText || "").trim());
  const commaParts = location.match(/^([^,]+),\s*(.+)$/);

  if (commaParts) {
    const city = trimAtClause(commaParts[1].trim());
    const state = normalizeState(trimAtClause(commaParts[2].trim()));

    if (city && state) {
      return { city, state };
    }
  }

  const parts = location.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const stateFromLast = US_STATE_NAMES[normalize(last)];

    if (/^[a-z]{2}$/i.test(last)) {
      return {
        city: parts.slice(0, -1).join(" "),
        state: normalizeState(last)
      };
    }

    if (stateFromLast) {
      return {
        city: parts.slice(0, -1).join(" "),
        state: stateFromLast
      };
    }
  }

  return {
    city: location,
    state: null
  };
}

function extractLocation(message, options = {}) {
  const text = String(message || "").trim();
  const result = { city: null, state: null };
  const nextField = options.nextField || null;
  const allowLocation =
    nextField === "city" ||
    nextField === "state" ||
    options.forceLocation === true;

  if (!text || isGreetingOrSmallTalk(text)) {
    return result;
  }

  const liveInMatch = text.match(
    /\b(?:live in|living in|i live in|vivo en|estoy en|based in|located in)\s+([^?.!]+)/i
  );

  if (liveInMatch) {
    const parsed = parseCityStateTokens(liveInMatch[1]);

    if (isValidCityName(parsed.city)) {
      result.city = parsed.city;
      result.state = parsed.state;
      return result;
    }
  }

  const commaMatch = text.match(/^([^,]+),\s*(.+)$/);

  if (commaMatch) {
    const cityCandidate = trimAtClause(commaMatch[1].trim());
    const stateCandidate = normalizeState(trimAtClause(commaMatch[2].trim()));

    if (isValidCityName(cityCandidate) && stateCandidate) {
      result.city = cityCandidate;
      result.state = stateCandidate;
      return result;
    }

    if (!allowLocation) {
      return result;
    }
  }

  if (allowLocation && !isLikelyQuestion(text)) {
    const parsed = parseCityStateTokens(text);

    if (isValidCityName(parsed.city)) {
      result.city = parsed.city;
      result.state = parsed.state || inferStateFromCity(parsed.city);
    }
  }

  return result;
}

function isLikelyQuestion(message) {
  const text = String(message || "").trim();

  if (!text) {
    return false;
  }

  if (text.includes("?")) {
    return true;
  }

  return /^(what|how|when|where|why|who|is|are|can|do|does|could|would|will|cuanto|cuánto|como|cómo|que|qué)\b/i.test(
    text
  );
}

function extractAuthorization(message, nextField = null) {
  const text = normalize(message);
  const asciiText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (nextField === "authorization") {
    if (isYes(text) || isYes(asciiText) || asciiText === "si" || asciiText === "yes") {
      return true;
    }

    if (isNo(text) || isNo(asciiText) || asciiText === "no") {
      return false;
    }
  }

  if (AUTHORIZATION_PATTERNS.some((pattern) => text.includes(pattern))) {
    return true;
  }

  return null;
}

const UNEMPLOYED_OCCUPATION_PATTERNS = [
  "unemployed",
  "desempleado",
  "desempleada",
  "sin trabajo",
  "sin empleo",
  "looking for work",
  "between jobs",
  "out of work",
  "not working",
  "i'm not working",
  "im not working",
  "i am not working",
  "don't work",
  "do not work",
  "no trabajo",
  "no estoy trabajando",
  "buscando empleo"
];

function normalizeOccupationStatus(text) {
  const normalized = normalize(text);

  if (matchesAny(normalized, UNEMPLOYED_OCCUPATION_PATTERNS)) {
    return "unemployed";
  }

  if (matchesAny(normalized, ["student", "estudiante", "estudiando"])) {
    return "Student";
  }

  if (matchesAny(normalized, ["retired", "retiree", "retirado", "retirada", "jubilado", "jubilada"])) {
    return "Retired";
  }

  return null;
}

function extractOccupation(message, existingOccupation, nextField = null) {
  if (existingOccupation) {
    return null;
  }

  const text = String(message || "").trim();
  const normalized = normalize(text);

  const status = normalizeOccupationStatus(text);
  if (status) {
    return status;
  }

  for (const pattern of OCCUPATION_PATTERNS) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return trimAtClause(match[1].trim());
    }
  }

  if (nextField === "occupation" && text && !/^(1|2)$/.test(text)) {
    if (isYes(text) || isNo(text)) {
      return null;
    }

    if (isLikelyQuestion(text) || isGreetingOrSmallTalk(text)) {
      return null;
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (wordCount <= 4 && text.length <= 40) {
      return trimAtClause(text);
    }
  }

  return null;
}

function extractInterviewType(message, nextField = null) {
  const text = normalize(message);

  if (detectLocalZoomPreference(message)) {
    return INTERVIEW_TYPES.ZOOM;
  }

  if (nextField !== "interviewType" && nextField !== "dayPart") {
    return null;
  }

  const officePatterns = [
    "office",
    "in office",
    "in person",
    "in-person",
    "person",
    "presencial",
    "oficina",
    "en persona"
  ];
  const zoomPatterns = ["zoom", "virtual", "online", "remoto", "por zoom"];

  if (officePatterns.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.OFFICE;
  }

  if (zoomPatterns.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.ZOOM;
  }

  if (text === "1" || /^1[\s.)-]/.test(text)) {
    return INTERVIEW_TYPES.OFFICE;
  }

  if (text === "2" || /^2[\s.)-]/.test(text)) {
    return INTERVIEW_TYPES.ZOOM;
  }

  return null;
}

function extractScheduleConfirmation(message, options = {}) {
  if (!options.awaitingConfirmation) {
    return false;
  }

  return isScheduleConfirmation(message);
}

function extractEmail(message, nextField = null) {
  if (nextField && nextField !== "email") {
    return null;
  }

  const match = String(message || "").match(/[^\s@]+@[^\s@]+\.[^\s@]+/);

  if (match) {
    return match[0].trim();
  }

  return null;
}

const EMAIL_DECLINE_PATTERNS = [
  /^no\b/i,
  /^nop\b/i,
  /^nope\b/i,
  /^skip\b/i,
  /^paso\b/i,
  /^no gracias\b/i,
  /^prefiero no\b/i,
  /\bno tengo correo\b/i,
  /\bno tengo email\b/i,
  /\bno quiero\b/i,
  /\bsin correo\b/i,
  /\bdon't have\b/i,
  /\bdont have\b/i,
  /\bprefer not\b/i,
  /\bno email\b/i
];

function isEmailDeclined(message) {
  const text = String(message || "").trim();

  if (!text) {
    return false;
  }

  const normalized = normalize(text);

  return EMAIL_DECLINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

const NAME_PREFIX_PATTERNS = [
  /^(?:my name is|mi nombre es|me llamo|soy|i am|i'm)\s+(.+)$/i
];

function extractName(message, nextField = null) {
  if (nextField !== "name") {
    return null;
  }

  const text = String(message || "").trim();

  if (!text || isLikelyQuestion(text) || isGreetingOrSmallTalk(text)) {
    return null;
  }

  for (const pattern of NAME_PREFIX_PATTERNS) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const candidate = trimAtClause(match[1].trim());

      if (candidate.length >= 2 && candidate.length <= 80) {
        return candidate;
      }
    }
  }

  if (text.length >= 2 && text.length <= 80 && !extractEmail(text)) {
    return trimAtClause(text);
  }

  return null;
}

function extractPreferredPeriod(message) {
  const text = normalize(message);

  if (
    text.includes("morning") ||
    text.includes("mañana") ||
    text.includes("manana") ||
    text === "1" ||
    text.includes("before 5") ||
    text.includes("antes de las 5")
  ) {
    return "morning";
  }

  if (
    text.includes("afternoon") ||
    text.includes("tarde") ||
    text === "2" ||
    text.includes("after 5") ||
    text.includes("después de las 5") ||
    text.includes("despues de las 5")
  ) {
    return "afternoon";
  }

  return null;
}

const LOCAL_ZOOM_PREFERENCE_PATTERNS = [
  "prefiero zoom",
  "no puedo ir a la oficina",
  "no puedo ir",
  "no tengo transporte",
  "se me hace dificil llegar",
  "se me hace difícil llegar",
  "trabajo lejos",
  "tengo niños",
  "no puedo salir",
  "can we do zoom",
  "cannot make it to the office",
  "can't make it to the office",
  "cant make it to the office",
  "prefer zoom",
  "by zoom",
  "por zoom"
];

const AUTHORIZATION_HANDOFF_PATTERNS = [
  "renewal",
  "renovacion",
  "renovación",
  "receipt",
  "recibo",
  "pending",
  "pendiente",
  "applied for",
  "aplique",
  "apllic",
  "solicite",
  "solicité",
  "asylum",
  "asilo",
  "visa",
  "ead",
  "opt",
  "cpt",
  "tps",
  "daca",
  "parole",
  "not sure",
  "no estoy seguro",
  "no estoy segura",
  "depends",
  "depende",
  "immigration",
  "inmigracion",
  "inmigración",
  "lawyer",
  "abogado"
];

function detectLocalZoomPreference(message) {
  const text = normalize(message);
  return LOCAL_ZOOM_PREFERENCE_PATTERNS.some((pattern) => text.includes(pattern));
}

function isAuthorizationAmbiguous(message) {
  const text = normalize(message);
  return AUTHORIZATION_HANDOFF_PATTERNS.some((pattern) => text.includes(pattern));
}

function extractDayPart(message, nextField = null) {
  if (nextField !== "dayPart" && nextField !== "interviewType") {
    return null;
  }

  return extractPreferredPeriod(message);
}

function extractState(message, nextField = null, existingCity = null) {
  if (nextField !== "state" || !existingCity) {
    return null;
  }

  const text = trimAtClause(String(message || "").trim());

  if (!text || isLikelyQuestion(text) || isGreetingOrSmallTalk(text)) {
    return null;
  }

  const normalized = normalizeState(text);

  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  if (US_STATE_NAMES[normalize(text)]) {
    return US_STATE_NAMES[normalize(text)];
  }

  return null;
}

function extractInformation(message, profile = {}, options = {}) {
  const extracted = {};
  const nextField = options.nextField || null;
  const inSchedule = options.inSchedule || false;
  const location = extractLocation(message, { nextField });

  if (location.city && !profile.city && isValidCityName(location.city)) {
    extracted.city = location.city;
  }

  if (location.state && !profile.state) {
    extracted.state = location.state;
  }

  const explicitState = extractState(message, nextField, profile.city || extracted.city);
  if (explicitState && !profile.state) {
    extracted.state = explicitState;
  }

  if (extracted.city && !isValidCityName(extracted.city)) {
    delete extracted.city;
    delete extracted.state;
  }

  if (extracted.city && !extracted.state && (nextField === "city" || nextField === "state")) {
    const inferredState = inferStateFromCity(extracted.city);
    if (inferredState) {
      extracted.state = inferredState;
    }
  }

  const authorization = extractAuthorization(message, nextField);
  if (authorization !== null && (profile.authorization === null || profile.authorization === undefined)) {
    extracted.authorization = authorization;
  }

  const occupation = extractOccupation(message, profile.occupation, nextField);
  if (occupation && nextField === "occupation") {
    extracted.occupation = occupation;
  }

  if (!inSchedule) {
    const interviewType = extractInterviewType(message, nextField);
    if (interviewType && (!profile.interviewType || detectLocalZoomPreference(message))) {
      extracted.interviewType = interviewType;
    }
  }

  const email = extractEmail(message, nextField);
  if (email && !profile.email) {
    extracted.email = email;
  }

  if (nextField === "email" && isEmailDeclined(message)) {
    extracted.emailSkipped = true;
  }

  const prospectName = extractName(message, nextField);
  if (prospectName) {
    extracted.name = prospectName;
  }

  const dayPart = extractDayPart(message, nextField);
  if (dayPart && !profile.dayPart) {
    extracted.dayPart = dayPart;
  }

  const preferredPeriod = extractPreferredPeriod(message);
  if (preferredPeriod && !profile.dayPart && (nextField === "dayPart" || nextField === "interviewType")) {
    extracted.dayPart = preferredPeriod;
  }

  if (nextField === "authorization" && isAuthorizationAmbiguous(message)) {
    extracted.authorizationAmbiguous = true;
  }

  if (inSchedule && detectScheduleOverride(message)) {
    extracted.scheduleOverride = message;
  }

  return extracted;
}

module.exports = {
  extractInformation,
  extractLocation,
  extractAuthorization,
  extractOccupation,
  extractInterviewType,
  extractScheduleConfirmation,
  extractEmail,
  extractName,
  isEmailDeclined,
  extractDayPart,
  detectLocalZoomPreference,
  isAuthorizationAmbiguous,
  inferStateFromCity,
  isValidCityName
};
