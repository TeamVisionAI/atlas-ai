/**
 * BR-141 — Spanish-first STT language hints.
 * Transcript language is metadata. Never mutate canonical preferred_language.
 */

"use strict";

const {
  normalizePreferredLanguage,
  isStaleDefaultPreferredLanguage
} = require("../../../core/prospectLanguage");

const SPANISH_PROMPT =
  "Transcribe this voice note in the spoken language. The speaker is expected to speak Spanish. Keep short answers such as sí in Spanish. Do not translate.";
const ENGLISH_PROMPT =
  "Transcribe this voice note in the spoken language. The speaker is expected to speak English. Do not translate.";
const BILINGUAL_PROMPT =
  "Transcribe this voice note in the spoken language. Spanish and English may both appear. Do not translate.";

function resolveSttLanguageHints(prospect = {}, options = {}) {
  if (options.mixed === true) {
    return {
      strategy: "bilingual",
      language: null,
      languages: Object.freeze(["es", "en"]),
      prompt: BILINGUAL_PROMPT
    };
  }

  const preferred = normalizePreferredLanguage(prospect.preferred_language);
  const staleEnglishDefault = isStaleDefaultPreferredLanguage(prospect);

  if (preferred === "spanish") {
    return {
      strategy: "spanish",
      language: "es",
      languages: Object.freeze(["es"]),
      prompt: SPANISH_PROMPT
    };
  }

  if (preferred === "english" && !staleEnglishDefault) {
    return {
      strategy: "english",
      language: "en",
      languages: Object.freeze(["en"]),
      prompt: ENGLISH_PROMPT
    };
  }

  return {
    strategy: "bilingual",
    language: null,
    languages: Object.freeze(["es", "en"]),
    prompt: BILINGUAL_PROMPT
  };
}

module.exports = {
  resolveSttLanguageHints,
  SPANISH_PROMPT,
  ENGLISH_PROMPT,
  BILINGUAL_PROMPT
};
