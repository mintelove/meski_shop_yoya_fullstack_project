/**
 * Report controller — PDF and CSV export endpoints.
 */
import { getSalesTracking, getSalesForExport } from "../services/analyticsService.js";
import { generatePdfReport, generateCsvReport } from "../services/reportService.js";
import { buildDateFilter, validateDateParams, getDateLabel } from "../utils/dateFilterUtil.js";

/**
 * GET /api/reports/export/pdf
 * Query params: ?date, ?startDate, ?endDate
 */
export const exportPdf = async (req, res, next) => {
  try {
    const validationErrors = validateDateParams(req.query);
    if (validationErrors) {
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    const dateFilter = buildDateFilter(req.query);
    const dateLabel = getDateLabel(req.query);

    // Get summary metrics and product breakdown
    const trackingResult = await getSalesTracking({
      dateFilter,
      userId: req.user._id,
      role: req.user.role
    });

    const pdfBuffer = await generatePdfReport({
      dateLabel,
      metrics: trackingResult.summary,
      salesData: trackingResult.byProduct,
      salesmanName: req.user.name
    });

    const filename = `report_${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/reports/export/csv
 * Query params: ?date, ?startDate, ?endDate
 */
export const exportCsv = async (req, res, next) => {
  try {
    const validationErrors = validateDateParams(req.query);
    if (validationErrors) {
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    const dateFilter = buildDateFilter(req.query);
    const dateLabel = getDateLabel(req.query);

    const salesData = await getSalesForExport({
      dateFilter,
      userId: req.user._id,
      role: req.user.role
    });

    const csv = generateCsvReport({ salesData, dateLabel, salesmanName: req.user.name });
    const filename = `report_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
};
