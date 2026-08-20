import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { updateAccountProfile } from "../services/accountService";
import { getStoredSessionToken } from "../services/atlasAuthService";
import {
  normalizeUiLanguage,
  resolveUiLanguage,
  SYSTEM_DEFAULT_LANGUAGE
} from "./languagePreference";
import { translations } from "./translations";
import { interpolate } from "./translate";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(SYSTEM_DEFAULT_LANGUAGE);
  const organizationDefaultRef = useRef(null);

  const applyLanguage = useCallback((code) => {
    const normalized = normalizeUiLanguage(code) || SYSTEM_DEFAULT_LANGUAGE;
    setLanguageState(normalized);
    return normalized;
  }, []);

  const syncFromUser = useCallback(
    (user, { organizationDefault } = {}) => {
      if (organizationDefault !== undefined) {
        organizationDefaultRef.current = organizationDefault;
      }

      const resolved = resolveUiLanguage({
        userPreference: user?.preferred_language,
        organizationDefault: organizationDefaultRef.current
      });

      applyLanguage(resolved);
      return resolved;
    },
    [applyLanguage]
  );

  const persistLanguagePreference = useCallback(async (code) => {
    const normalized = normalizeUiLanguage(code);

    if (!normalized || !getStoredSessionToken()) {
      return normalized;
    }

    try {
      await updateAccountProfile({ preferred_language: normalized });
    } catch (error) {
      console.warn("[language] Unable to persist user preference", error);
    }

    return normalized;
  }, []);

  const setLanguagePreference = useCallback(
    async (code, { persist = false } = {}) => {
      const normalized = applyLanguage(code);

      if (persist) {
        await persistLanguagePreference(normalized);
      }

      return normalized;
    },
    [applyLanguage, persistLanguagePreference]
  );

  const value = useMemo(() => {
    const catalog = translations[language] || translations.en;

    function translate(key, params) {
      const template = catalog[key] ?? translations.en[key] ?? key;
      return params ? interpolate(template, params) : template;
    }

    return {
      language,
      setLanguage: applyLanguage,
      setLanguagePreference,
      syncFromUser,
      toggleLanguage() {
        const next = language === "es" ? "en" : "es";
        setLanguagePreference(next, { persist: true });
      },
      translate
    };
  }, [applyLanguage, language, setLanguagePreference, syncFromUser]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
