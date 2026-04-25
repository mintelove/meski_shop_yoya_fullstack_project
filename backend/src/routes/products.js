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
      data.price = toAppCurrency(data.price, sourceCurrency);
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
    body("price").isFloat({ min: 0 }),
    body("quantity").isInt({ min: 0 }),
    body("category").notEmpty()
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const product = await Product.create({ ...req.body, currency: APP_CURRENCY });
      emitStockUpdate({ type: "product-created", product });
      return res.status(201).json(product);
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
    body("price").optional().isFloat({ min: 0 }),
    body("quantity").optional().isInt({ min: 0 }),
    body("category").optional().notEmpty()
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const product = await Product.findByIdAndUpdate(req.params.id, { ...req.body, currency: APP_CURRENCY }, { new: true });
      if (!product) {
        return res.status(404).json({ message: "Product not found." });
      }
      emitStockUpdate({ type: "product-updated", product });
      return res.json(product);
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
