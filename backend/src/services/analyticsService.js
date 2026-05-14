/**
 * Analytics service — core business logic for dashboard metrics,
 * sales tracking, chart trend data, and top products analytics.
 */
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { APP_CURRENCY, MISSING_CURRENCY_DEFAULT, USD_TO_ETB_RATE } from "../utils/currency.js";

// ─── Currency conversion expression for aggregation pipelines ───
const convertedSaleAmountExpr = (field) => ({
  $cond: [
    {
      $eq: [{ $ifNull: ["$currency", MISSING_CURRENCY_DEFAULT] }, APP_CURRENCY]
    },
    `$${field}`,
    { $multiply: [`$${field}`, USD_TO_ETB_RATE] }
  ]
});

// ─── Date helpers ───
const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfWeek = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const getWeekStartByOffset = (offset = 0) => {
  const weekStart = startOfWeek();
  weekStart.setDate(weekStart.getDate() - offset * 7);
  return weekStart;
};

const buildWeeklyRange = (endWeekStart, totalWeeks = 8) => {
  const range = [];
  for (let index = totalWeeks - 1; index >= 0; index -= 1) {
    const ws = new Date(endWeekStart);
    ws.setDate(ws.getDate() - index * 7);
    range.push(ws);
  }
  return range;
};

const toShortDate = (date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });

const getWeekOffset = (value) => {
  if (typeof value !== "string") return 0;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 12);
};

// ─── Dashboard metrics ───
/**
 * Get dashboard metrics for admin or salesman.
 * @param {Object} options
 * @param {Object} options.dateFilter - MongoDB createdAt filter (from buildDateFilter)
 * @param {string|null} options.userId - If set, filter sales by salesman_id
 * @param {boolean} options.isAdmin - Whether the user is admin
 * @returns {Object} metrics
 */
export const getDashboardMetrics = async ({ dateFilter = {}, userId = null, isAdmin = false }) => {
  const baseMatch = { status: "active" };
  if (userId) {
    baseMatch.salesman_id = new mongoose.Types.ObjectId(userId);
  }

  const dailyStart = startOfToday();
  const weekStart = startOfWeek();

  // If we have a specific dateFilter, we should technically prioritize it.
  // However, usually "Daily" and "Weekly" in a dashboard context mean "Today" and "This Week".
  // BUT the user requested "FULL synchronization" and "strictly show ZERO state" if a date with no records is selected.
  // To satisfy "Dashboard fully updates based on selected date", we'll make daily/weekly relative to the filter if it exists.

  let dailyMatch, weeklyMatch, totalMatch;

  if (Object.keys(dateFilter).length > 0) {
    // If a filter is active, everything is relative to it
    totalMatch = { ...baseMatch, ...dateFilter };
    dailyMatch = totalMatch; // For a single date, daily is the same. For range, it's the whole range.
    weeklyMatch = totalMatch;
  } else {
    totalMatch = { ...baseMatch };
    dailyMatch = { ...baseMatch, createdAt: { $gte: dailyStart } };
    weeklyMatch = { ...baseMatch, createdAt: { $gte: weekStart } };
  }

  const queries = [
    // Daily sales
    Sale.aggregate([
      { $match: dailyMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: convertedSaleAmountExpr("total_price") },
          itemsSold: { $sum: "$quantity" }
        }
      }
    ]),
    // Weekly sales
    Sale.aggregate([
      { $match: weeklyMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: convertedSaleAmountExpr("total_price") },
          itemsSold: { $sum: "$quantity" }
        }
      }
    ]),
    // Total revenue (all time or filtered)
    Sale.aggregate([
      { $match: totalMatch },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: convertedSaleAmountExpr("total_price") }
        }
      }
    ])
  ];

  // Admin-specific: product counts, stock, low stock
  if (isAdmin) {
    queries.push(
      Product.countDocuments(),
      Product.aggregate([{ $group: { _id: null, total: { $sum: "$quantity" } } }]),
      Product.countDocuments({
        $expr: { $lte: ["$quantity", "$lowStockThreshold"] }
      })
    );
  } else {
    // Salesman gets remaining stock units
    queries.push(
      Product.aggregate([{ $group: { _id: null, total: { $sum: "$quantity" } } }])
    );
  }

  const results = await Promise.all(queries);

  const daily = results[0][0] || { count: 0, amount: 0 };
  const weekly = results[1][0] || { count: 0, amount: 0 };
  const totalRevenue = results[2][0]?.totalRevenue || 0;

  if (isAdmin) {
    const productsCount = results[3];
    const stockUnits = results[4][0]?.total || 0;
    const lowStockAlerts = results[5];

    return {
      daily,
      weekly,
      totalRevenue,
      productsCount,
      stockUnits,
      lowStockAlerts,
      // Minimal Summary for filtered views
      dailySales: daily.amount,
      totalSales: totalRevenue,
      totalTransactions: daily.count,
      totalItemsSold: daily.itemsSold || 0
    };
  }

  const remainingStockUnits = results[3][0]?.total || 0;
  return {
    daily,
    weekly,
    totalRevenue,
    remainingStockUnits,
    // Minimal Summary for filtered views
    dailySales: daily.amount,
    totalSales: totalRevenue,
    totalTransactions: daily.count,
    totalItemsSold: daily.itemsSold || 0
  };
};

// ─── Dashboard trend data (charts) ───
/**
 * Get trend data for bar/line charts.
 * @param {Object} baseMatch - base MongoDB match (e.g. salesman_id filter)
 * @param {number} weekOffset - how many weeks back
 * @returns {Object} chart data
 */
export const getDashboardTrendData = async (baseMatch = { status: "active" }, weekOffset = 0, dateFilter = {}) => {
  // Ensure status is filtered if not already present
  if (!baseMatch.status) baseMatch.status = "active";
  let selectedWeekStart, selectedWeekEnd;

  // If a date filter is provided, try to extract a range from it for the charts
  if (dateFilter.createdAt) {
    const filter = dateFilter.createdAt;
    if (filter.$gte && filter.$lte) {
      // Single date or specific range
      selectedWeekStart = new Date(filter.$gte);
      selectedWeekEnd = new Date(filter.$lte);
    } else if (filter.$gte) {
      selectedWeekStart = new Date(filter.$gte);
      selectedWeekEnd = new Date(selectedWeekStart);
      selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 7);
    } else {
      selectedWeekStart = getWeekStartByOffset(weekOffset);
      selectedWeekEnd = new Date(selectedWeekStart);
      selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 7);
    }
  } else {
    selectedWeekStart = getWeekStartByOffset(weekOffset);
    selectedWeekEnd = new Date(selectedWeekStart);
    selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 7);
  }

  const weeklyRange = buildWeeklyRange(selectedWeekStart, 8);
  const weeklyRangeStart = weeklyRange[0];

  const [weekdayAgg, weeklyAgg] = await Promise.all([
    Sale.aggregate([
      {
        $match: {
          ...baseMatch,
          createdAt: { $gte: selectedWeekStart, $lt: selectedWeekEnd }
        }
      },
      {
        $group: {
          _id: { $isoDayOfWeek: "$createdAt" },
          itemsSold: { $sum: "$quantity" },
          revenue: { $sum: convertedSaleAmountExpr("total_price") },
          transactions: { $sum: 1 }
        }
      }
    ]),
    Sale.aggregate([
      {
        $match: {
          ...baseMatch,
          createdAt: { $gte: weeklyRangeStart, $lt: selectedWeekEnd }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: {
                $dateSubtract: {
                  startDate: "$createdAt",
                  unit: "day",
                  amount: {
                    $subtract: [{ $isoDayOfWeek: "$createdAt" }, 1]
                  }
                }
              }
            }
          },
          itemsSold: { $sum: "$quantity" },
          revenue: { $sum: convertedSaleAmountExpr("total_price") },
          transactions: { $sum: 1 }
        }
      }
    ])
  ]);

  const weekdayMap = new Map();
  weekdayAgg.forEach((entry) => weekdayMap.set(entry._id, entry));

  const weeklyMap = new Map();
  weeklyAgg.forEach((entry) => weeklyMap.set(entry._id, entry));

  return {
    selectedWeekStart: selectedWeekStart.toISOString().slice(0, 10),
    selectedWeekEnd: selectedWeekEnd.toISOString().slice(0, 10),
    weekOffset,
    dailyWeekTrend: WEEKDAY_LABELS.map((label, index) => {
      const bucket = weekdayMap.get(index + 1) || {};
      return {
        label,
        itemsSold: Number(bucket.itemsSold || 0),
        revenue: Number(bucket.revenue || 0),
        transactions: Number(bucket.transactions || 0)
      };
    }),
    weeklyPerformance: weeklyRange.map((ws, index) => {
      const key = ws.toISOString().slice(0, 10);
      const bucket = weeklyMap.get(key) || {};
      const weekStartDate = new Date(`${key}T00:00:00.000Z`);
      const weekEnd = new Date(weekStartDate);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return {
        label: `W${index + 1}`,
        weekStart: key,
        weekRange: `${toShortDate(weekStartDate)} - ${toShortDate(weekEnd)}`,
        itemsSold: Number(bucket.itemsSold || 0),
        revenue: Number(bucket.revenue || 0),
        transactions: Number(bucket.transactions || 0)
      };
    })
  };
};

// ─── Sales tracking ───
/**
 * Get sales tracking summary and per-product breakdown.
 * @param {Object} options
 * @param {Object} options.dateFilter - MongoDB createdAt filter
 * @param {string|null} options.userId - salesman filter
 * @param {string} options.role - user role
 * @returns {Object} { summary, byProduct }
 */
export const getSalesTracking = async ({ dateFilter = {}, userId = null, role = "salesman" }) => {
  const match = { ...dateFilter, status: "active" };
  if (role !== "admin" && userId) {
    match.salesman_id = new mongoose.Types.ObjectId(userId);
  }

  const [summary, productBreakdown] = await Promise.all([
    Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalItemsSold: { $sum: "$quantity" },
          totalRevenue: { $sum: convertedSaleAmountExpr("total_price") },
          totalTransactions: { $sum: 1 }
        }
      }
    ]),
    Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$product_name",
          itemsSold: { $sum: "$quantity" },
          totalRevenue: { $sum: convertedSaleAmountExpr("total_price") }
        }
      },
      { $sort: { itemsSold: -1, _id: 1 } }
    ])
  ]);

  return {
    summary: summary[0] || { totalItemsSold: 0, totalRevenue: 0, totalTransactions: 0 },
    byProduct: productBreakdown.map((item) => ({
      productName: item._id,
      itemsSold: item.itemsSold || 0,
      totalRevenue: item.totalRevenue || 0
    }))
  };
};

// ─── Top selling products ───
/**
 * Get top selling products for pie chart.
 * @param {Object} options
 * @param {Object} options.dateFilter - MongoDB createdAt filter
 * @param {number} options.limit - max items to return (default 10)
 * @returns {Array} [{ productName, totalSold }]
 */
export const getTopSellingProducts = async ({ dateFilter = {}, limit = 10 }) => {
  const match = { ...dateFilter, status: "active" };

  const results = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$product_id",
        productName: { $first: "$product_name" },
        totalSold: { $sum: "$quantity" },
        totalRevenue: { $sum: convertedSaleAmountExpr("total_price") }
      }
    },
    { $sort: { totalSold: -1 } },
    { $limit: limit }
  ]);

  return results.map((item) => ({
    productName: item.productName,
    totalSold: item.totalSold,
    totalRevenue: Number(item.totalRevenue || 0)
  }));
};

// ─── Get all sales for export ───
/**
 * Get all sales with optional date filtering for exports.
 * @param {Object} options
 * @param {Object} options.dateFilter - MongoDB createdAt filter
 * @param {string|null} options.userId - salesman filter
 * @param {string} options.role - user role
 * @returns {Array} sales documents
 */
export const getSalesForExport = async ({ dateFilter = {}, userId = null, role = "salesman" }) => {
  const query = { ...dateFilter, status: "active" };
  if (role !== "admin" && userId) {
    query.salesman_id = userId;
  }

  const sales = await Sale.find(query)
    .sort({ createdAt: -1 })
    .populate("salesman_id", "name email");

  return sales;
};

// Re-export the weekOffset parser for controllers
export { getWeekOffset };
