/**
 * Dashboard controller — handles admin, salesman, and sales-tracking endpoints.
 */
import mongoose from "mongoose";
import {
  getDashboardMetrics,
  getDashboardTrendData,
  getSalesTracking,
  getWeekOffset
} from "../services/analyticsService.js";
import { buildDateFilter, validateDateParams } from "../utils/dateFilterUtil.js";

/**
 * GET /api/dashboard/admin
 */
export const getAdminDashboard = async (req, res, next) => {
  try {
    const weekOffset = getWeekOffset(req.query.weekOffset);
    const dateFilter = buildDateFilter(req.query);

    const [metrics, chartData] = await Promise.all([
      getDashboardMetrics({ dateFilter, isAdmin: true }),
      getDashboardTrendData({}, weekOffset, dateFilter)
    ]);

    return res.json({
      daily: metrics.daily,
      weekly: metrics.weekly,
      totalRevenue: metrics.totalRevenue,
      productsCount: metrics.productsCount,
      stockUnits: metrics.stockUnits,
      lowStockAlerts: metrics.lowStockAlerts,
      dailySales: metrics.dailySales,
      totalSales: metrics.totalSales,
      totalTransactions: metrics.totalTransactions,
      totalItemsSold: metrics.totalItemsSold,
      dailyTrend: chartData.dailyWeekTrend,
      weeklyTrend: chartData.weeklyPerformance,
      dailyWeekTrend: chartData.dailyWeekTrend,
      weeklyPerformance: chartData.weeklyPerformance,
      chartMeta: {
        weekOffset: chartData.weekOffset,
        selectedWeekStart: chartData.selectedWeekStart,
        selectedWeekEnd: chartData.selectedWeekEnd
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/dashboard/salesman
 */
export const getSalesmanDashboard = async (req, res, next) => {
  try {
    const weekOffset = getWeekOffset(req.query.weekOffset);
    const userObjectId = new mongoose.Types.ObjectId(req.user._id);
    const dateFilter = buildDateFilter(req.query);

    const [metrics, chartData] = await Promise.all([
      getDashboardMetrics({ dateFilter, userId: req.user._id, isAdmin: false }),
      getDashboardTrendData({ salesman_id: userObjectId }, weekOffset, dateFilter)
    ]);

    return res.json({
      daily: metrics.daily,
      weekly: metrics.weekly,
      totalRevenue: metrics.totalRevenue,
      remainingStockUnits: metrics.remainingStockUnits,
      dailySales: metrics.dailySales,
      totalSales: metrics.totalSales,
      totalTransactions: metrics.totalTransactions,
      totalItemsSold: metrics.totalItemsSold,
      dailyTrend: chartData.dailyWeekTrend,
      weeklyTrend: chartData.weeklyPerformance,
      dailyWeekTrend: chartData.dailyWeekTrend,
      weeklyPerformance: chartData.weeklyPerformance,
      chartMeta: {
        weekOffset: chartData.weekOffset,
        selectedWeekStart: chartData.selectedWeekStart,
        selectedWeekEnd: chartData.selectedWeekEnd
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/dashboard/sales-tracking
 */
export const getSalesTrackingHandler = async (req, res, next) => {
  try {
    const { date, from, to } = req.query;

    // Validate date params
    const validationErrors = validateDateParams({ date, startDate: from, endDate: to });
    if (validationErrors) {
      return res.status(400).json({ success: false, message: validationErrors[0], errors: validationErrors });
    }

    const dateFilter = buildDateFilter(req.query);
    const result = await getSalesTracking({
      dateFilter,
      userId: req.user._id,
      role: req.user.role
    });

    return res.json({
      summary: result.summary,
      byProduct: result.byProduct,
      filter: {
        date: date || null,
        from: from || null,
        to: to || null
      }
    });
  } catch (error) {
    return next(error);
  }
};
