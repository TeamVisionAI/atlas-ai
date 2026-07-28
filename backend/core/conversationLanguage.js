/**
 * Sprint 21.1 — Per-message language detection for conversation replies.
 * Workflow order unchanged; only reply language selection.
 */

const SPANISH_WORDS = [
  "hola",
  "gracias",
  "sí",
  "si",
  "vivo",
  "trabajo",
  "entrevista",
  "estoy",
  "también",
  "tambien",
  "qué",
  "que",
  "cómo",
  "como",
  "dónde",
  "donde",
  "cuál",
  "cual",
  "cuánto",
  "cuanto",
  "por favor",
  "buenos",
  "buenas",
  "desempleado",
  "desempleada",
  "estudiante",
  "retirado",
  "retirada",
  "español",
  "espanol",
  "información",
  "informacion",
  "quisiera",
  "necesito",
  "puedo",
  "tengo",
  "estados unidos"
];

const ENGLISH_WORDS = [
  "hello",
  "hi",
  "thanks",
  "thank you",
  "yes",
  "no",
  "i'm",
  "im",
  "i am",
  "live",
  "work",
  "working",
  "interview",
  "where",
  "what",
  "how",
  "when",
  "english",
  "unemployed",
  "student",
  "retired",
  "nurse",
  "currently",
  "right now",
  "between jobs",
  "looking for",
  "share",
  "information",
  "about",
  "team vision",
  "amazon",
  "employed"
];

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function countWordHits(text, words) {
  let hits = 0;

  for (const word of words) {
    const pattern =
      word.length <= 2
        ? new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
        : new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

    if (pattern.test(text)) {
      hits += 1;
    }
  }

  return hits;
}

/**
 * Detect language from a single inbound message.
 * Returns "es", "en", or null when ambiguous.
 */
function detectMessageLanguage(message) {
  const text = normalize(message);

  if (!text) {
    return null;
  }

  let esScore = 0;
  let enScore = 0;

  if (/[áéíóúüñ¿¡]/i.test(text)) {
    esScore += 2;
  }

  esScore += countWordHits(text, SPANISH_WORDS);
  enScore += countWordHits(text, ENGLISH_WORDS);

  if (/\b(i'm|i am|don't|can't|what's|it's)\b/i.test(text)) {
    enScore += 2;
  }

  if (/\b(estoy|tengo|quisiera|necesito|puedo)\b/i.test(text)) {
    esScore += 1;
  }

  if (esScore > enScore && esScore >= 1) {
    return "es";
  }

  if (enScore > esScore && enScore >= 1) {
    return "en";
  }

  if (esScore === enScore && esScore > 0) {
    return null;
  }

  // Short direct English answers (occupation/status) without Spanish markers.
  if (/^[a-z0-9\s'.,-]+$/i.test(text) && !/[áéíóúüñ¿¡]/i.test(text)) {
    if (
      /\b(unemployed|student|retired|nurse|teacher|engineer|manager|sales|driver)\b/i.test(
        text
      ) ||
      /\b(i work|work at|not working|between jobs)\b/i.test(text)
    ) {
      return "en";
    }
  }

  return null;
}

function readPersistedLanguage(prospect) {
  const value = prospect?.communication_language || prospect?.language;

  if (value === "es" || value === "en") {
    return value;
  }

  return null;
}

/**
 * Resolve reply language: clear message language wins, else persisted, else English.
 */
function resolveConversationLanguage(prospect, message) {
  const detected = detectMessageLanguage(message);

  if (detected) {
    return detected;
  }

  const persisted = readPersistedLanguage(prospect);

  if (persisted) {
    return persisted;
  }

  return "en";
}

module.exports = {
  detectMessageLanguage,
  resolveConversationLanguage,
  readPersistedLanguage
};
