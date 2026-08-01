/** @typedef {"Spanish" | "English" | "Unknown"} ProspectLanguage */

export const PROSPECT_LANGUAGES = {
  SPANISH: "Spanish",
  ENGLISH: "English",
  UNKNOWN: "Unknown"
};

/**
 * Normalizes API language codes for future package/template routing.
 * @param {string | null | undefined} value
 * @returns {ProspectLanguage}
 */
export function normalizeProspectLanguage(value) {
  return formatPreferredLanguageDisplay(value);
}

/**
 * Maps canonical preferred_language storage or conversation codes to UI labels.
 * Implements BR-041 — Preferred Language display is independent of brain.language.
 * @param {string | null | undefined} value
 * @returns {ProspectLanguage}
 */
export function formatPreferredLanguageDisplay(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "spanish" || normalized === "es" || normalized === "español") {
    return PROSPECT_LANGUAGES.SPANISH;
  }

  if (normalized === "english" || normalized === "en") {
    return PROSPECT_LANGUAGES.ENGLISH;
  }

  return PROSPECT_LANGUAGES.UNKNOWN;
}

/**
 * Resolves Mission Control / Workspace preferred-language display from read-model fields.
 * @param {{ preferred_language?: string | null, preferred_language_label?: string | null } | null | undefined} prospect
 * @returns {ProspectLanguage}
 */
export function resolvePreferredLanguageDisplay(prospect) {
  if (prospect?.preferred_language_label) {
    return prospect.preferred_language_label;
  }

  return formatPreferredLanguageDisplay(prospect?.preferred_language);
}
