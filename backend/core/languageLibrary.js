function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

const YES_PATTERNS = [
  "yes",
  "y",
  "yep",
  "yeah",
  "sure",
  "absolutely",
  "of course",
  "correct",
  "i do",
  "si",
  "sí",
  "claro",
  "por supuesto",
  "definitely",
  "affirmative",
  "you bet",
  "green card",
  "citizen",
  "citizenship",
  "usc",
  "work permit",
  "permit",
  "tps",
  "authorized",
  "autorizado",
  "autorizada"
];

const NO_PATTERNS = [
  "no",
  "nope",
  "negative",
  "nah",
  "not yet",
  "not authorized",
  "para nada",
  "sin permiso",
  "no tengo permiso",
  "no tengo papeles",
  "no tengo autorización",
  "no tengo autorizacion",
  "don't",
  "do not"
];

const UNEMPLOYED_PATTERNS = [
  "unemployed",
  "looking for work",
  "between jobs",
  "laid off",
  "no job",
  "sin trabajo",
  "buscando empleo",
  "desempleado",
  "desempleada",
  "out of work",
  "job search",
  "searching for work",
  "sin empleo"
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toAsciiLower(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesPattern(text, pattern) {
  const normalized = normalize(text);
  const asciiNormalized = toAsciiLower(text);

  if (pattern.length <= 2) {
    const asciiPattern = toAsciiLower(pattern);
    return new RegExp(`\\b${escapeRegex(asciiPattern)}\\b`, "i").test(asciiNormalized);
  }

  return normalized.includes(pattern);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => matchesPattern(text, pattern));
}

function isYes(text) {
  return matchesAny(text, YES_PATTERNS);
}

/**
 * Bare conversational yes — pending yes/no questions only.
 * Courtesy titles ("sí señor") count; "sí soy ciudadano" / "si tengo licencia" do not.
 * Implements BR-195. Do not use this to invent authorization outside a pending ask.
 */
function isBareConversationalYes(text) {
  const t = toAsciiLower(text)
    .replace(/[¡!¿?,.;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) {
    return false;
  }
  if (/\b(tengo|have|permiso|autoriz|licen|ciudadan|residente|papeles)\b/.test(t)) {
    return false;
  }
  // Implements BR-229 — stacked affirmatives ("si claro", "yes sure") are still yes.
  // Do not match "si miami" / "yes orlando": every token must be a yes-atom or courtesy.
  const yesAtom =
    "(ok|okay|yes|yep|yeah|sure|sounds good|that works|perfect|si|claro|por supuesto|correcto|asi es|afirmativo|of course|thats right|that is right|affirmative)";
  const courtesy = "(senor|senora|senorita|senores|sir|maam|ma am|please)";
  const tail = "(que si)";
  return new RegExp(
    `^${yesAtom}(\\s+(${yesAtom}|${tail}|${courtesy}))*$`
  ).test(t);
}

function isNo(text) {
  return matchesAny(text, NO_PATTERNS);
}

function isUnemployed(text) {
  return matchesAny(text, UNEMPLOYED_PATTERNS);
}

const SCHEDULE_CONFIRMATION_PATTERNS = [
  "yes",
  "yeah",
  "yep",
  "that works",
  "works for me",
  "works for me",
  "confirm it",
  "confirm",
  "confirmed",
  "sounds good",
  "perfect",
  "si",
  "sí",
  "me funciona",
  "perfecto",
  "confirmala",
  "confírmala",
  "esta bien",
  "está bien",
  "de acuerdo",
  "ok",
  "okay"
];

function isScheduleConfirmation(text) {
  return matchesAny(text, SCHEDULE_CONFIRMATION_PATTERNS);
}

module.exports = {
  YES_PATTERNS,
  NO_PATTERNS,
  UNEMPLOYED_PATTERNS,
  SCHEDULE_CONFIRMATION_PATTERNS,
  isYes,
  isBareConversationalYes,
  isNo,
  isUnemployed,
  isScheduleConfirmation,
  matchesAny
};
