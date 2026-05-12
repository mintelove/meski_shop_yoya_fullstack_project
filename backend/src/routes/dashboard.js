/**
 * Dashboard routes — delegates to dashboardController.
 * All business logic has been extracted to services/analyticsService.js
 */
import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  getAdminDashboard,
  getSalesmanDashboard,
  getSalesTrackingHandler
} from "../controllers/dashboardController.js";

const router = express.Router();

// Admin dashboard metrics + charts
router.get("/admin", protect, authorize("admin"), getAdminDashboard);

// Salesman dashboard metrics + charts
router.get("/salesman", protect, authorize("salesman", "admin"), getSalesmanDashboard);

// Sales tracking with date filtering
router.get("/sales-tracking", protect, authorize("salesman", "admin"), getSalesTrackingHandler);

export default router;
