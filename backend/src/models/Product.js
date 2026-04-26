import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "ETB", enum: ["ETB", "USD"] },
    quantity: { type: Number, required: true, min: 0 },
    initialStock: { type: Number, default: 0, min: 0 },
    category: { type: String, required: true, trim: true },
    lowStockThreshold: { type: Number, default: 10, min: 0 }
  },
  { timestamps: true }
);

export const Product = mongoose.model("Product", productSchema);
