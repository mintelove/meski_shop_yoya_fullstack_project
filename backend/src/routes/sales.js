import express from "express";
import { body } from "express-validator";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { protect, authorize } from "../middleware/auth.js";
import { handleValidation } from "../utils/validation.js";
import { emitStockUpdate } from "../utils/socket.js";
import { APP_CURRENCY, getRecordCurrency, toAppCurrency } from "../utils/currency.js";

const router = express.Router();

router.get("/", protect, async (req, res, next) => {
  try {
    const query = req.user.role === "admin" ? {} : { salesman_id: req.user._id };
    const sales = await Sale.find(query).sort({ createdAt: -1 }).populate("salesman_id", "name email");
    const normalizedSales = sales.map((sale) => {
      const sourceCurrency = getRecordCurrency(sale.currency);
      if (sourceCurrency === APP_CURRENCY) return sale;
      const data = sale.toObject();
      data.unit_price = toAppCurrency(data.unit_price, sourceCurrency);
      data.total_price = toAppCurrency(data.total_price, sourceCurrency);
      data.currency = APP_CURRENCY;
      return data;
    });
    return res.json(normalizedSales);
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/",
  protect,
  authorize("salesman", "admin"),
  [body("productId").isMongoId(), body("quantity").isInt({ min: 1 })],
  handleValidation,
  async (req, res, next) => {
    try {
      const { productId, quantity } = req.body;

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found." });
      }
      const sourceCurrency = getRecordCurrency(product.currency);
      const productPrice = toAppCurrency(product.price, sourceCurrency);
      if (product.quantity < quantity) {
        return res.status(400).json({ message: "Insufficient stock quantity." });
      }

      product.quantity -= quantity;
      await product.save();

      const totalPrice = Number((productPrice * quantity).toFixed(2));
      const sale = await Sale.create({
        product_id: product._id,
        product_name: product.name,
        quantity,
        unit_price: productPrice,
        total_price: totalPrice,
        currency: APP_CURRENCY,
        salesman_id: req.user._id
      });

      emitStockUpdate({
        type: "sale-created",
        productId: product._id,
        remainingQuantity: product.quantity,
        sale
      });

      return res.status(201).json(sale);
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
