/**
 * Analytics controller — top-selling products endpoint.
 */
import { getTopSellingProducts } from "../services/analyticsService.js";
import { buildDateFilter, validateDateParams } from "../utils/dateFilterUtil.js";

/**
 * GET /api/analytics/top-products
 * Query params: ?date, ?startDate, ?endDate, ?limit
 */
export const getTopProducts = async (req, res, next) => {
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
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

    const topProducts = await getTopSellingProducts({ dateFilter, limit });

    return res.json({
      success: true,
      data: topProducts,
      filter: {
        date: req.query.date || null,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null
      }
    });
  } catch (error) {
    return next(error);
  }
};
