import { useI18n } from "../context/I18nContext";

export const LanguageSwitcher = () => {
  const { language, switchLanguage, t } = useI18n();

  return (
    <div className="language-switcher">
      <label htmlFor="language-select">{t("common.language")}</label>
      <select id="language-select" value={language} onChange={(e) => switchLanguage(e.target.value)}>
        <option value="en">{t("common.english")}</option>
        <option value="am">{t("common.amharic")}</option>
      </select>
    </div>
  );
};
