import { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "../locales/en.json";
import am from "../locales/am.json";

const I18nContext = createContext(null);

const dictionaries = { en, am };
const supportedLanguages = ["en", "am"];

const getByPath = (obj, path) =>
  path.split(".").reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, obj);

const getInitialLanguage = () => {
  const savedLanguage = localStorage.getItem("language");
  if (savedLanguage && supportedLanguages.includes(savedLanguage)) return savedLanguage;
  return "en";
};

export const I18nProvider = ({ children }) => {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language === "am" ? "am" : "en";
  }, [language]);

  const switchLanguage = (nextLanguage) => {
    if (!supportedLanguages.includes(nextLanguage)) return;
    setLanguage(nextLanguage);
    localStorage.setItem("language", nextLanguage);
  };

  const t = (key, fallback = key) => {
    const currentDictionary = dictionaries[language];
    const value = getByPath(currentDictionary, key);
    return typeof value === "string" ? value : fallback;
  };

  const value = useMemo(
    () => ({
      language,
      switchLanguage,
      t
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
