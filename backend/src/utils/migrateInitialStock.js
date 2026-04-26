import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";

/**
 * One-time idempotent migration: compute initialStock for existing products.
 * initialStock = currentQuantity + total quantity sold (from Sales collection).
 * Skips products that already have initialStock > 0.
 */
export const migrateInitialStock = async () => {
  const productsToMigrate = await Product.find({
    $or: [{ initialStock: { $exists: false } }, { initialStock: 0 }]
  });

  if (productsToMigrate.length === 0) return;

  // eslint-disable-next-line no-console
  console.log(`Migrating initialStock for ${productsToMigrate.length} product(s)...`);

  const salesAgg = await Sale.aggregate([
    {
      $group: {
        _id: "$product_id",
        totalSold: { $sum: "$quantity" }
      }
    }
  ]);

  const soldMap = new Map();
  salesAgg.forEach((entry) => {
    soldMap.set(entry._id.toString(), entry.totalSold);
  });

  const ops = productsToMigrate.map((product) => {
    const totalSold = soldMap.get(product._id.toString()) || 0;
    const initialStock = product.quantity + totalSold;
    return {
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { initialStock } }
      }
    };
  });

  if (ops.length > 0) {
    await Product.bulkWrite(ops);
    // eslint-disable-next-line no-console
    console.log(`Migrated initialStock for ${ops.length} product(s).`);
  }
};
