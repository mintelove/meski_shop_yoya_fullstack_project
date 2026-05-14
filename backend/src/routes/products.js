import express from "express";
import { body } from "express-validator";
import { Product } from "../models/Product.js";
import { protect, authorize } from "../middleware/auth.js";
import { handleValidation } from "../utils/validation.js";
import { emitStockUpdate } from "../utils/socket.js";
import { APP_CURRENCY, getRecordCurrency, toAppCurrency } from "../utils/currency.js";

const router = express.Router();

router.get("/", protect, async (req, res, next) => {
  try {
    const { search, category } = req.query;
    const query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (category) {
      query.category = category;
    }

    const products = await Product.find(query).sort({ createdAt: -1 });
    const normalizedProducts = products.map((product) => {
      const sourceCurrency = getRecordCurrency(product.currency);
      if (sourceCurrency === APP_CURRENCY) return product;
      const data = product.toObject();
      data.purchasedPrice = toAppCurrency(data.purchasedPrice || 0, sourceCurrency);
      data.minSellingPrice = toAppCurrency(data.minSellingPrice || 0, sourceCurrency);
      data.currency = APP_CURRENCY;
      return data;
    });
    return res.json(normalizedProducts);
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/",
  protect,
  authorize("admin"),
  [
    body("name").notEmpty(),
    body("purchasedPrice").optional().isFloat({ min: 0 }).withMessage("Purchased price must be a valid number ≥ 0"),
    body("minSellingPrice").optional().isFloat({ min: 0 }).withMessage("Minimum selling price must be a valid number ≥ 0"),
    body("quantity").isInt({ min: 0 }),
    body("category").notEmpty()
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const qty = Number(req.body.quantity) || 0;
      const purchasedPrice = Number(req.body.purchasedPrice) || 0;
      const minSellingPrice = Number(req.body.minSellingPrice) || 0;

      // Cross-field validation
      if (minSellingPrice < purchasedPrice) {
        return res.status(400).json({
          success: false,
          message: "Minimum selling price must be greater than or equal to purchased price"
        });
      }

      const product = await Product.create({
        name: req.body.name,
        purchasedPrice,
        minSellingPrice,
        quantity: qty,
        category: req.body.category,
        lowStockThreshold: req.body.lowStockThreshold,
        currency: APP_CURRENCY,
        initialStock: qty
      });
      emitStockUpdate({ type: "product-created", product });
      return res.status(201).json({
        success: true,
        message: "Product Added Successfully",
        product
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.put(
  "/:id",
  protect,
  authorize("admin"),
  [
    body("name").optional().notEmpty(),
    body("purchasedPrice").optional().isFloat({ min: 0 }).withMessage("Purchased price must be a valid number ≥ 0"),
    body("minSellingPrice").optional().isFloat({ min: 0 }).withMessage("Minimum selling price must be a valid number ≥ 0"),
    body("quantity").optional().isInt({ min: 0 }),
    body("category").optional().notEmpty()
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const existing = await Product.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Product not found." });
      }

      // Resolve final values (use submitted value or fall back to existing)
      const purchasedPrice = req.body.purchasedPrice !== undefined ? Number(req.body.purchasedPrice) : (existing.purchasedPrice || 0);
      const minSellingPrice = req.body.minSellingPrice !== undefined ? Number(req.body.minSellingPrice) : (existing.minSellingPrice || 0);

      // Cross-field validation
      if (minSellingPrice < purchasedPrice) {
        return res.status(400).json({
          success: false,
          message: "Minimum selling price must be greater than or equal to purchased price"
        });
      }

      const updateData = {
        name: req.body.name,
        purchasedPrice,
        minSellingPrice,
        quantity: req.body.quantity,
        category: req.body.category,
        lowStockThreshold: req.body.lowStockThreshold,
        currency: APP_CURRENCY
      };
      // Remove undefined keys so we don't overwrite with undefined
      Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

      // If quantity increased (restocking), increase initialStock by the same delta
      if (req.body.quantity !== undefined) {
        const newQty = Number(req.body.quantity);
        const oldQty = existing.quantity;
        if (newQty > oldQty) {
          const delta = newQty - oldQty;
          updateData.initialStock = (existing.initialStock || 0) + delta;
        }
      }

      const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
      emitStockUpdate({ type: "product-updated", product });
      return res.json({
        success: true,
        message: "Product Updated Successfully",
        product
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete("/:id", protect, authorize("admin"), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    emitStockUpdate({ type: "product-deleted", productId: req.params.id });
    return res.json({ message: "Product deleted successfully." });
  } catch (error) {
    return next(error);
  }
});

export default router;
