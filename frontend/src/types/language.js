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
  if (value === "es") {
    return PROSPECT_LANGUAGES.SPANISH;
  }

  if (value === "en") {
    return PROSPECT_LANGUAGES.ENGLISH;
  }

  return PROSPECT_LANGUAGES.UNKNOWN;
}
