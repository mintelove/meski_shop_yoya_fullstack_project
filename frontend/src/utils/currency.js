const currencyCode = import.meta.env.VITE_CURRENCY_CODE || "ETB";
const defaultLocale = import.meta.env.VITE_CURRENCY_LOCALE || "en-ET";

const getFormatter = () => {
  const activeLanguage = localStorage.getItem("language");
  const locale = activeLanguage === "am" ? "am-ET" : defaultLocale;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const formatCurrency = (value) => `Br ${getFormatter().format(Number(value || 0))}`;
export const appCurrencyCode = currencyCode;
