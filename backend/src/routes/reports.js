/**
 * Report routes — PDF and CSV export endpoints.
 */
import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import { exportPdf, exportCsv } from "../controllers/reportController.js";

const router = express.Router();

// GET /api/reports/export/pdf
router.get("/export/pdf", protect, authorize("admin", "salesman"), exportPdf);

// GET /api/reports/export/csv
router.get("/export/csv", protect, authorize("admin", "salesman"), exportCsv);

export default router;
