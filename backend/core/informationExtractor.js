const { isYes, isNo, matchesAny } = require("./languageLibrary");
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

function extractLocation(message) {
  const text = String(message || "").trim();
  const result = { city: null, state: null };

  const commaMatch = text.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    result.city = trimAtClause(commaMatch[1].trim());
    result.state = normalizeState(trimAtClause(commaMatch[2].trim()));
    return result;
  }

  const liveInMatch = text.match(
    /\b(?:live in|living in|i live in|vivo en|estoy en|based in|located in|from)\s+([^,.!?]+)/i
  );

  if (liveInMatch) {
    const location = trimAtClause(liveInMatch[1].trim());
    const parts = location.split(/\s+/);

    if (parts.length >= 2 && /^[a-z]{2}$/i.test(parts[parts.length - 1])) {
      result.state = parts[parts.length - 1].toUpperCase();
      result.city = parts.slice(0, -1).join(" ");
    } else {
      result.city = location;
      result.state = inferStateFromCity(location);
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

  if (nextField === "authorization") {
    if (isYes(text)) {
      return true;
    }

    if (isNo(text)) {
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

function isGreetingOrSmallTalk(text) {
  const normalized = normalize(text);

  return (
    /^(hola|hello|hi|hey|buenos dias|buenas|good morning|good afternoon)\b/i.test(normalized) ||
    /\b(información|informacion|information|team vision|quisiera|want to know|tell me about)\b/i.test(
      normalized
    )
  );
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
  const officePatterns = ["office", "in person", "in-person", "person", "presencial", "oficina"];
  const zoomPatterns = ["zoom", "virtual", "online", "remoto"];

  if (officePatterns.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.OFFICE;
  }

  if (zoomPatterns.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.ZOOM;
  }

  if (nextField === "interviewType") {
    if (text === "1" || /^1[\s.)-]/.test(text)) {
      return INTERVIEW_TYPES.OFFICE;
    }

    if (text === "2" || /^2[\s.)-]/.test(text)) {
      return INTERVIEW_TYPES.ZOOM;
    }
  }

  return null;
}

function extractEmail(message) {
  const match = String(message || "").match(/[^\s@]+@[^\s@]+\.[^\s@]+/);

  if (match) {
    return match[0].trim();
  }

  return null;
}

function extractPreferredPeriod(message) {
  const text = normalize(message);

  if (
    text.includes("morning") ||
    text.includes("mañana") ||
    text.includes("before 5") ||
    text.includes("antes de las 5")
  ) {
    return "morning";
  }

  if (
    text.includes("afternoon") ||
    text.includes("tarde") ||
    text.includes("after 5") ||
    text.includes("después de las 5") ||
    text.includes("despues de las 5")
  ) {
    return "afternoon";
  }

  return null;
}

function extractInformation(message, profile = {}, options = {}) {
  const extracted = {};
  const nextField = options.nextField || null;
  const inSchedule = options.inSchedule || false;
  const location = extractLocation(message);

  if (location.city && !profile.city) {
    extracted.city = location.city;
  }

  if (location.state && !profile.state) {
    extracted.state = location.state;
  }

  const authorization = extractAuthorization(message, nextField);
  if (authorization !== null && (profile.authorization === null || profile.authorization === undefined)) {
    extracted.authorization = authorization;
  }

  const occupation = extractOccupation(message, profile.occupation, nextField);
  if (occupation) {
    extracted.occupation = occupation;
  }

  if (!inSchedule) {
    const interviewType = extractInterviewType(message, nextField);
    if (interviewType && !profile.interviewType) {
      extracted.interviewType = interviewType;
    }
  }

  const email = extractEmail(message);
  if (email && !profile.email) {
    extracted.email = email;
  }

  const preferredPeriod = extractPreferredPeriod(message);
  if (preferredPeriod) {
    extracted.preferredPeriod = preferredPeriod;
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
  extractEmail
};
