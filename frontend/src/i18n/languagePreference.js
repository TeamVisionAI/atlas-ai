/** UI language codes stored on atlas_users.preferred_language */

export const SUPPORTED_UI_LANGUAGES = Object.freeze(["en", "es"]);
export const SYSTEM_DEFAULT_LANGUAGE = "en";

/**
 * Normalize arbitrary language input to a supported UI code (en | es).
 * @param {string | null | undefined} value
 * @returns {"en" | "es" | null}
 */
export function normalizeUiLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "en" || raw === "english" || raw.startsWith("en-")) {
    return "en";
  }

  if (raw === "es" || raw === "spanish" || raw === "español" || raw.startsWith("es-")) {
    return "es";
  }

  return null;
}

/**
 * Resolve effective UI language.
 * Priority: user preference → organization default → system default (English).
 *
 * @param {{ userPreference?: string | null, organizationDefault?: string | null }} sources
 * @returns {"en" | "es"}
 */
export function resolveUiLanguage({ userPreference, organizationDefault } = {}) {
  return (
    normalizeUiLanguage(userPreference) ||
    normalizeUiLanguage(organizationDefault) ||
    SYSTEM_DEFAULT_LANGUAGE
  );
}
