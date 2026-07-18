import { createContext, useContext, useMemo, useState } from "react";
import { translations } from "./translations";
import { interpolate } from "./translate";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("es");

  const value = useMemo(() => {
    const catalog = translations[language] || translations.es;

    function translate(key, params) {
      const template = catalog[key] ?? translations.en[key] ?? key;
      return params ? interpolate(template, params) : template;
    }

    return {
      language,
      setLanguage,
      toggleLanguage() {
        setLanguage((current) => (current === "es" ? "en" : "es"));
      },
      t: catalog,
      translate
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
