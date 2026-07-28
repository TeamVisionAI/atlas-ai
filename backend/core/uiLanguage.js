/**
 * Sprint 20.0.1 — User UI language (atlas_users.preferred_language).
 * Storage: en | es
 */

const SUPPORTED_UI_LANGUAGES = Object.freeze(["en", "es"]);
const SYSTEM_DEFAULT_UI_LANGUAGE = "en";

function normalizeUiLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "en" || raw === "english" || raw.startsWith("en-")) {
    return "en";
  }

  if (raw === "es" || raw === "spanish" || raw === "español" || raw.startsWith("es-")) {
    return "es";
  }

  return null;
}

function resolveUiLanguage({ userPreference, organizationDefault } = {}) {
  return (
    normalizeUiLanguage(userPreference) ||
    normalizeUiLanguage(organizationDefault) ||
    SYSTEM_DEFAULT_UI_LANGUAGE
  );
}

module.exports = {
  SUPPORTED_UI_LANGUAGES,
  SYSTEM_DEFAULT_UI_LANGUAGE,
  normalizeUiLanguage,
  resolveUiLanguage
};
