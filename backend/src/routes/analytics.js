/**
 * Analytics routes — top-selling products and analytics endpoints.
 */
import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import { getTopProducts } from "../controllers/analyticsController.js";

const router = express.Router();

// GET /api/analytics/top-products
router.get("/top-products", protect, authorize("admin", "salesman"), getTopProducts);

export default router;
