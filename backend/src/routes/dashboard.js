import express from "express";
import mongoose from "mongoose";
import { protect, authorize } from "../middleware/auth.js";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { APP_CURRENCY, MISSING_CURRENCY_DEFAULT, USD_TO_ETB_RATE } from "../utils/currency.js";

const router = express.Router();

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

const parseDateInput = (value) => {
  if (!value) return null;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate;
};

const toDateRange = ({ singleDate, startDate, endDate }) => {
  if (singleDate) {
    const start = new Date(singleDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (!startDate && !endDate) return null;

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (start) start.setHours(0, 0, 0, 0);
  if (end) {
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
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
    const weekStart = new Date(endWeekStart);
    weekStart.setDate(weekStart.getDate() - index * 7);
    range.push(weekStart);
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

const convertedSaleAmountExpr = (field) => ({
  $cond: [
    {
      $eq: [{ $ifNull: ["$currency", MISSING_CURRENCY_DEFAULT] }, APP_CURRENCY]
    },
    `$${field}`,
    { $multiply: [`$${field}`, USD_TO_ETB_RATE] }
  ]
});

const getDashboardTrendData = async (baseMatch, weekOffset = 0) => {
  const selectedWeekStart = getWeekStartByOffset(weekOffset);
  const selectedWeekEnd = new Date(selectedWeekStart);
  selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 7);

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
  weekdayAgg.forEach((entry) => {
    weekdayMap.set(entry._id, entry);
  });

  const weeklyMap = new Map();
  weeklyAgg.forEach((entry) => {
    weeklyMap.set(entry._id, entry);
  });

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
    weeklyPerformance: weeklyRange.map((weekStart, index) => {
      const key = weekStart.toISOString().slice(0, 10);
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

router.get("/admin", protect, authorize("admin"), async (req, res, next) => {
  try {
    const weekOffset = getWeekOffset(req.query.weekOffset);
    const dailyStart = startOfToday();
    const weekStart = startOfWeek();
    const [totalStock, salesAgg, stockCount, lowStockCount, dailyAgg, weeklyAgg, chartData] =
      await Promise.all([
      Product.aggregate([{ $group: { _id: null, total: { $sum: "$quantity" } } }]),
      Sale.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: convertedSaleAmountExpr("total_price") },
            totalSales: { $sum: 1 }
          }
        }
      ]),
      Product.countDocuments(),
      Product.countDocuments({
        $expr: { $lte: ["$quantity", "$lowStockThreshold"] }
      }),
      Sale.aggregate([
        { $match: { createdAt: { $gte: dailyStart } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: convertedSaleAmountExpr("total_price") } } }
      ]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: weekStart } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: convertedSaleAmountExpr("total_price") } } }
      ]),
      getDashboardTrendData({}, weekOffset)
      ]);

    return res.json({
      daily: dailyAgg[0] || { count: 0, amount: 0 },
      weekly: weeklyAgg[0] || { count: 0, amount: 0 },
      total: salesAgg[0]
        ? { count: salesAgg[0].totalSales || 0, amount: salesAgg[0].totalRevenue || 0 }
        : { count: 0, amount: 0 },
      dailyTrend: chartData.dailyWeekTrend,
      weeklyTrend: chartData.weeklyPerformance,
      dailyWeekTrend: chartData.dailyWeekTrend,
      weeklyPerformance: chartData.weeklyPerformance,
      chartMeta: {
        weekOffset: chartData.weekOffset,
        selectedWeekStart: chartData.selectedWeekStart,
        selectedWeekEnd: chartData.selectedWeekEnd
      },
      totalSales: salesAgg[0]?.totalSales || 0,
      stockCount,
      totalStockUnits: totalStock[0]?.total || 0,
      revenue: salesAgg[0]?.totalRevenue || 0,
      lowStockCount
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/salesman", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const weekOffset = getWeekOffset(req.query.weekOffset);
    const userObjectId = new mongoose.Types.ObjectId(req.user._id);
    const dayStart = startOfToday();
    const weekStart = startOfWeek();
    const [daily, weekly, total, stock, chartData] = await Promise.all([
      Sale.aggregate([
        { $match: { salesman_id: userObjectId, createdAt: { $gte: dayStart } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: convertedSaleAmountExpr("total_price") } } }
      ]),
      Sale.aggregate([
        { $match: { salesman_id: userObjectId, createdAt: { $gte: weekStart } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: convertedSaleAmountExpr("total_price") } } }
      ]),
      Sale.aggregate([
        { $match: { salesman_id: userObjectId } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: convertedSaleAmountExpr("total_price") } } }
      ]),
      Product.aggregate([{ $group: { _id: null, total: { $sum: "$quantity" } } }]),
      getDashboardTrendData({ salesman_id: userObjectId }, weekOffset)
    ]);

    return res.json({
      daily: daily[0] || { count: 0, amount: 0 },
      weekly: weekly[0] || { count: 0, amount: 0 },
      total: total[0] || { count: 0, amount: 0 },
      remainingStockUnits: stock[0]?.total || 0,
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
});

router.get("/sales-tracking", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    const singleDate = parseDateInput(date);
    const startDate = parseDateInput(from);
    const endDate = parseDateInput(to);

    if (date && !singleDate) {
      return res.status(400).json({ message: "Invalid date filter." });
    }
    if (from && !startDate) {
      return res.status(400).json({ message: "Invalid start date filter." });
    }
    if (to && !endDate) {
      return res.status(400).json({ message: "Invalid end date filter." });
    }
    if (startDate && endDate && endDate < startDate) {
      return res.status(400).json({ message: "Invalid date range. End date cannot be earlier than start date." });
    }

    const dateRange = toDateRange({ singleDate, startDate, endDate });
    const match = {};

    if (req.user.role !== "admin") {
      match.salesman_id = new mongoose.Types.ObjectId(req.user._id);
    }

    if (dateRange?.start || dateRange?.end) {
      match.createdAt = {};
      if (dateRange.start) match.createdAt.$gte = dateRange.start;
      if (dateRange.end) match.createdAt.$lt = dateRange.end;
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

    return res.json({
      summary: summary[0] || { totalItemsSold: 0, totalRevenue: 0, totalTransactions: 0 },
      byProduct: productBreakdown.map((item) => ({
        productName: item._id,
        itemsSold: item.itemsSold || 0,
        totalRevenue: item.totalRevenue || 0
      })),
      filter: {
        date: date || null,
        from: from || null,
        to: to || null
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
