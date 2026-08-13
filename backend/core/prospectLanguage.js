/**
 * Sprint 17.3 — Canonical prospect preferred language (independent of recruiter UI).
 * Storage: english | spanish
 * Legacy communication_language / language: en | es (kept in sync for AI pipelines).
 *
 * Authoritative preferred_language is human/operator-selected (Quick Capture / editor).
 * WhatsApp create historically omitted preferred_language while setting language=es, so the
 * DB DEFAULT 'english' falsely overrode Spanish communication fields for template routing.
 */

const PREFERRED_LANGUAGES = Object.freeze(["english", "spanish"]);
const DEFAULT_PREFERRED_LANGUAGE = "english";

const PREFERRED_LANGUAGE_LABELS = Object.freeze({
  english: "English",
  spanish: "Spanish"
});

function normalizePreferredLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "english" || raw === "en") {
    return "english";
  }

  if (raw === "spanish" || raw === "es" || raw === "español") {
    return "spanish";
  }

  return null;
}

/**
 * Detect the DB-default english + Spanish pipeline-fields conflict introduced by
 * WhatsApp create omitting preferred_language (migration 010 DEFAULT 'english').
 * This is NOT an authoritative human English selection.
 */
function isStaleDefaultPreferredLanguage(prospect = {}) {
  const preferred = normalizePreferredLanguage(prospect.preferred_language);
  if (preferred !== "english") {
    return false;
  }

  if (readQuickCapturePreferredLanguage(prospect.notes) === "english") {
    return false;
  }

  const pipeline =
    normalizePreferredLanguage(prospect.communication_language) ||
    normalizePreferredLanguage(prospect.language);

  return pipeline === "spanish";
}

/**
 * Human/operator (or Quick Capture) language that must not be overwritten by detection.
 */
function hasAuthoritativePreferredLanguage(prospect = {}) {
  if (readQuickCapturePreferredLanguage(prospect.notes)) {
    return true;
  }

  const preferred = normalizePreferredLanguage(prospect.preferred_language);
  if (!preferred) {
    return false;
  }

  if (isStaleDefaultPreferredLanguage(prospect)) {
    return false;
  }

  return true;
}

function resolveProspectPreferredLanguage(prospect = {}) {
  // Prefer authoritative preferred_language; skip stale DB-default english.
  const preferred = normalizePreferredLanguage(prospect.preferred_language);
  if (preferred && !isStaleDefaultPreferredLanguage(prospect)) {
    return preferred;
  }

  return (
    normalizePreferredLanguage(prospect.communication_language) ||
    normalizePreferredLanguage(prospect.language) ||
    DEFAULT_PREFERRED_LANGUAGE
  );
}

function preferredLanguageToCommunicationCode(preferred) {
  const normalized = normalizePreferredLanguage(preferred) || DEFAULT_PREFERRED_LANGUAGE;
  return normalized === "spanish" ? "es" : "en";
}

function resolveProspectCommunicationCode(prospect = {}) {
  return preferredLanguageToCommunicationCode(resolveProspectPreferredLanguage(prospect));
}

function formatPreferredLanguageLabel(preferred) {
  const normalized = normalizePreferredLanguage(preferred) || DEFAULT_PREFERRED_LANGUAGE;
  return PREFERRED_LANGUAGE_LABELS[normalized];
}

function syncProspectLanguageFields(preferredLanguage) {
  const preferred = normalizePreferredLanguage(preferredLanguage) || DEFAULT_PREFERRED_LANGUAGE;
  const code = preferredLanguageToCommunicationCode(preferred);

  return {
    preferred_language: preferred,
    communication_language: code,
    language: code
  };
}

/**
 * Resolve language fields for WhatsApp prospect create.
 * Strong first-message detection wins; otherwise keep Team Vision WhatsApp Spanish-first default.
 * Always sets preferred_language so DB DEFAULT 'english' cannot falsely win.
 */
function resolveWhatsAppCreateLanguageFields(firstMessage = null) {
  const { detectMessageLanguage } = require("./conversationLanguage");
  const detected = detectMessageLanguage(firstMessage);

  if (detected === "en") {
    return syncProspectLanguageFields("english");
  }

  if (detected === "es") {
    return syncProspectLanguageFields("spanish");
  }

  // Ambiguous / empty first message — WhatsApp create historically used es pipeline fields.
  return syncProspectLanguageFields("spanish");
}

/**
 * Strong evidence only — short tokens like "Si" / "Ok" / "8" must not flip language.
 */
function isStrongPersistedLanguageSignal(message = "", detectedCode = null) {
  if (!normalizePreferredLanguage(detectedCode)) {
    return false;
  }

  const sample = String(message || "").trim();
  if (!sample) {
    return false;
  }

  // Ambiguous / acknowledgement tokens — never flip established language.
  if (/^(si|sí|ok|okay|yes|no|k|kk|\d+)$/i.test(sample)) {
    return false;
  }

  if (sample.split(/\s+/).filter(Boolean).length >= 2) {
    return true;
  }

  if (/[áéíóúüñ¿¡]/i.test(sample)) {
    return true;
  }

  if (/^(hola|hello|hi|hey|buenos|buenas|thanks|gracias)\b/i.test(sample)) {
    return true;
  }

  return false;
}

/**
 * May persist detected conversation language onto preferred_language.
 * Never overwrites authoritative human/Quick Capture language.
 * Ambiguous/short messages never flip an established language.
 */
function resolvePersistedLanguageUpdate(
  prospect = {},
  detectedCode = null,
  { message = null, requireStrongSignal = true } = {}
) {
  const detected = normalizePreferredLanguage(detectedCode);
  if (!detected) {
    return null;
  }

  if (hasAuthoritativePreferredLanguage(prospect)) {
    return null;
  }

  if (
    requireStrongSignal &&
    !isStrongPersistedLanguageSignal(message, detectedCode)
  ) {
    return null;
  }

  const current = resolveProspectPreferredLanguage(prospect);
  const preferred = normalizePreferredLanguage(prospect.preferred_language);

  // Already consistent — no write.
  if (
    preferred === detected &&
    normalizePreferredLanguage(prospect.communication_language) === detected &&
    normalizePreferredLanguage(prospect.language) === detected
  ) {
    return null;
  }

  // Established pipeline language is sticky against a weak opposing signal
  // (requireStrongSignal already filtered most cases; keep current if mismatch without strong).
  if (
    current &&
    current !== detected &&
    !isStaleDefaultPreferredLanguage(prospect) &&
    (normalizePreferredLanguage(prospect.communication_language) ||
      normalizePreferredLanguage(prospect.language)) === current &&
    !isStrongPersistedLanguageSignal(message, detectedCode)
  ) {
    return null;
  }

  return syncProspectLanguageFields(detected);
}

function readQuickCapturePreferredLanguage(notes) {
  const match = String(notes || "").match(/QUICK_CAPTURE:({[\s\S]*?})/);

  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]);
    return normalizePreferredLanguage(parsed.preferred_language);
  } catch {
    return null;
  }
}

/**
 * True when the prospect already has a stored language from capture or profile data.
 * Unlike resolveProspectPreferredLanguage(), this does not default to English.
 * Stale DB-default english + Spanish pipeline fields do not count as stored preferred.
 */
function hasStoredPreferredLanguage(prospect = {}) {
  if (readQuickCapturePreferredLanguage(prospect.notes)) {
    return true;
  }

  if (hasAuthoritativePreferredLanguage(prospect)) {
    return true;
  }

  if (
    normalizePreferredLanguage(prospect.communication_language) ||
    normalizePreferredLanguage(prospect.language)
  ) {
    return true;
  }

  return false;
}

module.exports = {
  PREFERRED_LANGUAGES,
  DEFAULT_PREFERRED_LANGUAGE,
  PREFERRED_LANGUAGE_LABELS,
  normalizePreferredLanguage,
  resolveProspectPreferredLanguage,
  resolveProspectCommunicationCode,
  preferredLanguageToCommunicationCode,
  formatPreferredLanguageLabel,
  syncProspectLanguageFields,
  resolveWhatsAppCreateLanguageFields,
  resolvePersistedLanguageUpdate,
  isStaleDefaultPreferredLanguage,
  hasAuthoritativePreferredLanguage,
  isStrongPersistedLanguageSignal,
  readQuickCapturePreferredLanguage,
  hasStoredPreferredLanguage
};
