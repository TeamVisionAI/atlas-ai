/**
 * Sprint 17.3 — Canonical prospect preferred language (independent of recruiter UI).
 * Storage: english | spanish
 * Legacy communication_language / language: en | es (kept in sync for AI pipelines).
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

function resolveProspectPreferredLanguage(prospect = {}) {
  return (
    normalizePreferredLanguage(prospect.preferred_language) ||
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

module.exports = {
  PREFERRED_LANGUAGES,
  DEFAULT_PREFERRED_LANGUAGE,
  PREFERRED_LANGUAGE_LABELS,
  normalizePreferredLanguage,
  resolveProspectPreferredLanguage,
  resolveProspectCommunicationCode,
  preferredLanguageToCommunicationCode,
  formatPreferredLanguageLabel,
  syncProspectLanguageFields
};
