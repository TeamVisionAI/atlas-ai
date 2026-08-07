/**
 * Recruit AI v2 — conversational language adaptation (BR-082).
 * Sticky preferred language, but not permanently immutable when prior value
 * was only default/inferred and active conversation shows clear evidence.
 */

const { LANGUAGES } = require("./constants");
const { normalizeLanguage } = require("./conversationContext");

const LANGUAGE_SOURCE = Object.freeze({
  DEFAULT: "default",
  INFERRED: "inferred",
  EXPLICIT: "explicit",
  ACTIVE_CONVERSATION: "active_conversation"
});

function emptyLanguageMeta() {
  return {
    source: LANGUAGE_SOURCE.DEFAULT,
    spanishEvidenceCount: 0,
    englishEvidenceCount: 0,
    lastMessageLanguage: LANGUAGES.UNKNOWN
  };
}

function isMutableLanguageSource(source) {
  return (
    source === LANGUAGE_SOURCE.DEFAULT ||
    source === LANGUAGE_SOURCE.INFERRED ||
    source == null ||
    source === ""
  );
}

/**
 * Strong language evidence — not a single ambiguous token.
 * Greetings and multi-token Spanish/English content count.
 */
function isStrongLanguageSignal({ messageLanguage, intent, text } = {}) {
  if (
    messageLanguage !== LANGUAGES.SPANISH &&
    messageLanguage !== LANGUAGES.ENGLISH
  ) {
    return false;
  }

  if (intent === "greeting") {
    return true;
  }

  const sample = String(text || "").trim();
  if (sample.split(/\s+/).filter(Boolean).length >= 2) {
    return true;
  }

  // Single-token city names are not language-evidence flips.
  return false;
}

/**
 * Resolve preferred language for this turn and next context meta.
 * Explicit preferences never flip from conversational evidence alone.
 */
function resolveConversationalLanguage({
  context,
  messageLanguage,
  intent,
  text,
  explicitPreference = null
} = {}) {
  const prior = normalizeLanguage(context?.preferredLanguage || LANGUAGES.UNKNOWN);
  const meta = {
    ...emptyLanguageMeta(),
    ...(context?.languageMeta || {})
  };

  if (explicitPreference) {
    const preferred = normalizeLanguage(explicitPreference);
    return {
      preferredLanguage:
        preferred === LANGUAGES.UNKNOWN ? prior || LANGUAGES.ENGLISH : preferred,
      languageMeta: {
        ...meta,
        source: LANGUAGE_SOURCE.EXPLICIT,
        lastMessageLanguage: normalizeLanguage(messageLanguage)
      },
      adapted: false,
      reason: "EXPLICIT_PREFERENCE"
    };
  }

  const msgLang = normalizeLanguage(messageLanguage);
  meta.lastMessageLanguage = msgLang;

  const strong = isStrongLanguageSignal({
    messageLanguage: msgLang,
    intent,
    text
  });

  if (strong && msgLang === LANGUAGES.SPANISH) {
    meta.spanishEvidenceCount = Number(meta.spanishEvidenceCount || 0) + 1;
  }
  if (strong && msgLang === LANGUAGES.ENGLISH) {
    meta.englishEvidenceCount = Number(meta.englishEvidenceCount || 0) + 1;
  }

  if (meta.source === LANGUAGE_SOURCE.EXPLICIT) {
    return {
      preferredLanguage: prior === LANGUAGES.UNKNOWN ? LANGUAGES.ENGLISH : prior,
      languageMeta: meta,
      adapted: false,
      reason: "EXPLICIT_STICKY"
    };
  }

  // Established active-conversation language is sticky against a single
  // foreign-language digression (e.g. one English FAQ mid-Spanish flow).
  if (
    meta.source === LANGUAGE_SOURCE.ACTIVE_CONVERSATION &&
    (prior === LANGUAGES.SPANISH || prior === LANGUAGES.ENGLISH) &&
    msgLang !== LANGUAGES.UNKNOWN &&
    msgLang !== prior &&
    intent !== "request_language_switch"
  ) {
    return {
      preferredLanguage: prior,
      languageMeta: meta,
      adapted: false,
      reason: "ACTIVE_CONVERSATION_STICKY"
    };
  }

  // Clear Spanish greeting/evidence may supersede default/inferred English.
  if (
    isMutableLanguageSource(meta.source) &&
    msgLang === LANGUAGES.SPANISH &&
    strong &&
    meta.spanishEvidenceCount >= 1
  ) {
    return {
      preferredLanguage: LANGUAGES.SPANISH,
      languageMeta: {
        ...meta,
        source: LANGUAGE_SOURCE.ACTIVE_CONVERSATION
      },
      adapted: prior !== LANGUAGES.SPANISH,
      reason: "ACTIVE_CONVERSATION_SPANISH"
    };
  }

  if (
    isMutableLanguageSource(meta.source) &&
    msgLang === LANGUAGES.ENGLISH &&
    strong &&
    meta.englishEvidenceCount >= 1 &&
    prior === LANGUAGES.UNKNOWN
  ) {
    return {
      preferredLanguage: LANGUAGES.ENGLISH,
      languageMeta: {
        ...meta,
        source: LANGUAGE_SOURCE.ACTIVE_CONVERSATION
      },
      adapted: true,
      reason: "ACTIVE_CONVERSATION_ENGLISH"
    };
  }

  let preferred = prior;
  if (preferred === LANGUAGES.UNKNOWN) {
    preferred =
      msgLang !== LANGUAGES.UNKNOWN ? msgLang : LANGUAGES.ENGLISH;
    if (isMutableLanguageSource(meta.source)) {
      meta.source = LANGUAGE_SOURCE.INFERRED;
    }
  }

  return {
    preferredLanguage: preferred,
    languageMeta: meta,
    adapted: false,
    reason: "STICKY"
  };
}

module.exports = {
  LANGUAGE_SOURCE,
  emptyLanguageMeta,
  isStrongLanguageSignal,
  resolveConversationalLanguage
};
