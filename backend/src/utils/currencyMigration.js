import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { APP_CURRENCY, getRecordCurrency, toAppCurrency } from "./currency.js";

const migrationEnabled = () => process.env.ENABLE_USD_TO_ETB_MIGRATION === "true";

const migrateProducts = async () => {
  const products = await Product.find({});
  let updated = 0;
  for (const product of products) {
    const sourceCurrency = getRecordCurrency(product.currency);
    const convertedPrice = toAppCurrency(product.price, sourceCurrency);
    const shouldUpdate = sourceCurrency !== APP_CURRENCY || convertedPrice !== product.price;
    if (shouldUpdate) {
      product.price = convertedPrice;
      product.currency = APP_CURRENCY;
      await product.save();
      updated += 1;
    }
  }
  return updated;
};

const migrateSales = async () => {
  const sales = await Sale.find({});
  let updated = 0;
  for (const sale of sales) {
    const sourceCurrency = getRecordCurrency(sale.currency);
    const convertedUnit = toAppCurrency(sale.unit_price, sourceCurrency);
    const convertedTotal = toAppCurrency(sale.total_price, sourceCurrency);
    const shouldUpdate =
      sourceCurrency !== APP_CURRENCY || convertedUnit !== sale.unit_price || convertedTotal !== sale.total_price;
    if (shouldUpdate) {
      sale.unit_price = convertedUnit;
      sale.total_price = convertedTotal;
      sale.currency = APP_CURRENCY;
      await sale.save();
      updated += 1;
    }
  }
  return updated;
};

export const migrateLegacyCurrencyToEtb = async () => {
  if (!migrationEnabled()) return;
  const [productUpdates, saleUpdates] = await Promise.all([migrateProducts(), migrateSales()]);
  // eslint-disable-next-line no-console
  console.log(`Currency migration complete. Products: ${productUpdates}, Sales: ${saleUpdates}`);
};
