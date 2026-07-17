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

function matchesPattern(text, pattern) {
  const normalized = normalize(text);

  if (pattern.length <= 2) {
    return new RegExp(`\\b${escapeRegex(pattern)}\\b`, "i").test(normalized);
  }

  return normalized.includes(pattern);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => matchesPattern(text, pattern));
}

function isYes(text) {
  return matchesAny(text, YES_PATTERNS);
}

function isNo(text) {
  return matchesAny(text, NO_PATTERNS);
}

function isUnemployed(text) {
  return matchesAny(text, UNEMPLOYED_PATTERNS);
}

module.exports = {
  YES_PATTERNS,
  NO_PATTERNS,
  UNEMPLOYED_PATTERNS,
  isYes,
  isNo,
  isUnemployed,
  matchesAny
};
