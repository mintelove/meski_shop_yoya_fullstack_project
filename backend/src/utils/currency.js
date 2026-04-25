const normalizeCurrency = (currency) => (currency || "").toUpperCase();

export const APP_CURRENCY = normalizeCurrency(process.env.APP_CURRENCY) || "ETB";
export const LEGACY_CURRENCY = normalizeCurrency(process.env.LEGACY_CURRENCY) || "USD";
export const MISSING_CURRENCY_DEFAULT = normalizeCurrency(process.env.MISSING_CURRENCY_DEFAULT) || APP_CURRENCY;
export const USD_TO_ETB_RATE = Number(process.env.USD_TO_ETB_RATE || 57);

export const toEtb = (value) => Number((Number(value || 0) * USD_TO_ETB_RATE).toFixed(2));

export const toAppCurrency = (value, currency = APP_CURRENCY) => {
  const normalizedCurrency = normalizeCurrency(currency);
  if (normalizedCurrency === APP_CURRENCY) {
    return Number(value || 0);
  }
  if (normalizedCurrency === "USD" && APP_CURRENCY === "ETB") {
    return toEtb(value);
  }
  return Number(value || 0);
};

export const getRecordCurrency = (recordCurrency) => {
  const normalizedCurrency = normalizeCurrency(recordCurrency);
  if (normalizedCurrency) return normalizedCurrency;
  return MISSING_CURRENCY_DEFAULT;
};
