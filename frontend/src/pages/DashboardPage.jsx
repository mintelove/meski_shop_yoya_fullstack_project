import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { formatCurrency } from "../utils/currency";
import { useI18n } from "../context/I18nContext";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" }
  })
};

const StatCard = ({ title, value, subtitle, index }) => (
  <motion.div
    className="card stat-card dashboard-stat-card"
    custom={index}
    initial="hidden"
    animate="visible"
    variants={cardVariants}
    whileHover={{
      scale: 1.03,
      borderColor: "rgba(16, 185, 129, 0.4)",
      boxShadow: "0 0 20px rgba(16, 185, 129, 0.15), 0 8px 32px rgba(0, 0, 0, 0.2)"
    }}
    whileTap={{
      scale: 0.97,
      background: "rgba(16, 185, 129, 0.15)"
    }}
    transition={{ type: "spring", stiffness: 300, damping: 20 }}
  >
    <p className="dashboard-stat-title">{title}</p>
    <p className="dashboard-stat-value">{value}</p>
    {subtitle ? <p className="muted dashboard-stat-subtitle">{subtitle}</p> : null}
  </motion.div>
);

const TransactionChartCard = ({ title, data, type, t }) => {
  const hasData = (data || []).some((item) => (item.itemsSold || 0) > 0 || (item.revenue || 0) > 0);
  const chartData = hasData ? data : [];

  const tooltipFormatter = (value, key) => {
    if (key === "revenue") return [formatCurrency(value), t("dashboard.revenueLegend")];
    if (key === "itemsSold") return [value, t("dashboard.itemsSoldLegend")];
    return [value, key];
  };

  return (
    <motion.div
      className="card dashboard-chart-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.3 }}
    >
      <h4>{title}</h4>
      {!hasData ? (
        <p className="muted">{t("dashboard.noTransactions")}</p>
      ) : (
        <div className="dashboard-chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            {type === "daily" ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                <Bar dataKey="itemsSold" name={t("dashboard.itemsSoldLegend")} fill="#10b981" radius={[5, 5, 0, 0]} animationEasing="ease-in-out" />
                <Bar dataKey="revenue" name={t("dashboard.revenueLegend")} fill="#0d9488" radius={[5, 5, 0, 0]} animationEasing="ease-in-out" />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={tooltipFormatter} labelFormatter={(_, payload) => payload?.[0]?.payload?.weekRange || ""} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="itemsSold"
                  name={t("dashboard.itemsSoldLegend")}
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10b981' }}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                  animationEasing="ease-in-out"
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={t("dashboard.revenueLegend")}
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0d9488' }}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                  animationEasing="ease-in-out"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export const DashboardPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [trackingData, setTrackingData] = useState(null);
  const [trackingError, setTrackingError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [singleDate, setSingleDate] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [activeFilter, setActiveFilter] = useState("none");
  const [weekOffset, setWeekOffset] = useState(0);
  const [lowStockItems, setLowStockItems] = useState([]);

  const fetchDashboard = useCallback(async () => {
    const endpoint = user?.role === "admin" ? "/dashboard/admin" : "/dashboard/salesman";
    if (!endpoint) return;
    try {
      setError("");
      const res = await api.get(endpoint, { params: { weekOffset } });
      setData(res.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || t("dashboard.loadFailed"));
    }
  }, [t, user?.role, weekOffset]);

  const fetchSalesTracking = useCallback(
    async ({ date = "", from = "", to = "" } = {}) => {
      try {
        setTrackingLoading(true);
        setTrackingError("");
        const res = await api.get("/dashboard/sales-tracking", {
          params: {
            ...(date ? { date } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {})
          }
        });
        setTrackingData(res.data);
      } catch (requestError) {
        setTrackingError(requestError.response?.data?.message || t("dashboard.salesTrackingFailed"));
      } finally {
        setTrackingLoading(false);
      }
    },
    [t]
  );

  const fetchLowStock = useCallback(async () => {
    try {
      const res = await api.get("/products");
      const items = (res.data || []).filter(
        (p) => p.quantity < 2
      );
      setLowStockItems(items);
    } catch {
      // silent – alert cards are supplementary
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchSalesTracking();
    fetchLowStock();
  }, [fetchDashboard, fetchSalesTracking, fetchLowStock]);

  useSocket("stock:update", () => {
    fetchDashboard();
    fetchLowStock();
  });

  const metrics = useMemo(() => {
    if (!data) return [];
    const base = [
      {
        title: t("dashboard.dailySales"),
        value: formatCurrency(data.daily?.amount),
        subtitle: `${data.daily?.count || 0} ${t("dashboard.transactions")}`
      },
      {
        title: t("dashboard.weeklySales"),
        value: formatCurrency(data.weekly?.amount),
        subtitle: `${data.weekly?.count || 0} ${t("dashboard.transactions")}`
      },
      {
        title: t("dashboard.totalSales"),
        value: formatCurrency(data.total?.amount),
        subtitle: `${data.total?.count || 0} ${t("dashboard.transactions")}`
      }
    ];

    if (user?.role === "admin") {
      return [
        ...base,
        { title: t("dashboard.totalRevenue"), value: formatCurrency(data.revenue), subtitle: t("dashboard.allCompletedSales") },
        { title: t("dashboard.productsCount"), value: data.stockCount || 0, subtitle: t("dashboard.catalogItems") },
        { title: t("dashboard.stockUnits"), value: data.totalStockUnits || 0, subtitle: t("dashboard.availableInventoryUnits") },
        { title: t("dashboard.lowStockAlerts"), value: data.lowStockCount || 0, subtitle: t("dashboard.needsRestockSoon") }
      ];
    }

    return [
      ...base,
      { title: t("dashboard.remainingStockUnits"), value: data.remainingStockUnits || 0, subtitle: t("dashboard.globalStockQuantity") }
    ];
  }, [data, t, user?.role]);

  const onApplyFilter = async () => {
    if (singleDate) {
      setActiveFilter("single");
      await fetchSalesTracking({ date: singleDate });
      return;
    }

    if (rangeFrom || rangeTo) {
      if (rangeFrom && rangeTo && rangeTo < rangeFrom) {
        setTrackingError(t("dashboard.invalidRange"));
        return;
      }
      setActiveFilter("range");
      await fetchSalesTracking({ from: rangeFrom, to: rangeTo });
      return;
    }

    setActiveFilter("none");
    await fetchSalesTracking();
  };

  const onResetFilter = async () => {
    setSingleDate("");
    setRangeFrom("");
    setRangeTo("");
    setActiveFilter("none");
    setTrackingError("");
    await fetchSalesTracking();
  };

  const hasProductBreakdown = (trackingData?.byProduct || []).length > 0;
  const canGoNextWeek = weekOffset > 0;

  if (!data && !error) return <div>{t("common.loading")}</div>;

  return (
    <div className="stack">
      <motion.h2
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
      >
        {user?.role === "admin" ? t("dashboard.adminTitle") : t("dashboard.myTitle")}
      </motion.h2>
      {error ? <p className="error">{error}</p> : null}

      {/* Low-Stock Alert Cards – pinned to top */}
      {lowStockItems.length > 0 && (
        <div className="low-stock-alerts-grid">
          {lowStockItems.map((item, i) => {
            const isCritical = item.quantity <= 1 && item.quantity > 0;
            const isOutOfStock = item.quantity === 0;
            const cardClass = [
              "card low-stock-alert-card",
              isCritical && "low-stock-alert-card--critical",
              isOutOfStock && "low-stock-alert-card--out-of-stock"
            ].filter(Boolean).join(" ");

            return (
              <motion.div
                key={item._id}
                className={cardClass}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
              >
                {(isCritical || isOutOfStock) && (
                  <span className="low-stock-priority-badge">
                    {isOutOfStock
                      ? t("dashboard.outOfStock")
                      : t("dashboard.criticalLeft")}
                  </span>
                )}
                <p className="low-stock-alert-name">{item.name}</p>
                <p className="low-stock-alert-count">{item.quantity}</p>
                <button className="low-stock-restock-btn" type="button">
                  {t("dashboard.restockNow")}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="grid dashboard-metrics-grid">
        {metrics.map((metric, i) => (
          <StatCard key={metric.title} title={metric.title} value={metric.value} subtitle={metric.subtitle} index={i} />
        ))}
      </div>

      <div className="grid dashboard-chart-grid">
        <motion.div
          className="card row-between dashboard-chart-controls"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <h4>{t("dashboard.chartRangeTitle")}</h4>
          <div className="form-inline">
            <button className="btn secondary" type="button" onClick={() => setWeekOffset((prev) => prev + 1)}>
              {t("dashboard.previousWeek")}
            </button>
            <button className="btn secondary" type="button" onClick={() => setWeekOffset((prev) => Math.max(prev - 1, 0))} disabled={!canGoNextWeek}>
              {t("dashboard.nextWeek")}
            </button>
          </div>
        </motion.div>
        <TransactionChartCard title={t("dashboard.dailyTrend")} data={data?.dailyWeekTrend || []} type="daily" t={t} />
        <TransactionChartCard title={t("dashboard.weeklyPerformance")} data={data?.weeklyPerformance || []} type="weekly" t={t} />
      </div>

      <motion.div
        className="card stack dashboard-tracking-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <h3>{t("dashboard.salesTrackingTitle")}</h3>
        <div className="form dashboard-filter-row">
          <label className="dashboard-filter-group">
            <span className="muted">{t("dashboard.singleDate")}</span>
            <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
          </label>
          <label className="dashboard-filter-group">
            <span className="muted">{t("dashboard.fromDate")}</span>
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          </label>
          <label className="dashboard-filter-group">
            <span className="muted">{t("dashboard.toDate")}</span>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
          </label>
          <button className="btn" type="button" onClick={onApplyFilter} disabled={trackingLoading}>
            {t("dashboard.applyFilter")}
          </button>
          <button className="btn secondary" type="button" onClick={onResetFilter} disabled={trackingLoading}>
            {t("dashboard.resetFilter")}
          </button>
        </div>
        <p className="muted">
          {activeFilter === "single"
            ? t("dashboard.singleDateMode")
            : activeFilter === "range"
              ? t("dashboard.rangeMode")
              : t("dashboard.allTimeMode")}
        </p>
        {trackingError ? <p className="error">{trackingError}</p> : null}

        <div className="grid dashboard-metrics-grid">
          <StatCard
            title={t("dashboard.totalItemsSold")}
            value={trackingLoading ? t("common.loading") : trackingData?.summary?.totalItemsSold || 0}
            index={0}
          />
          <StatCard
            title={t("dashboard.filteredRevenue")}
            value={trackingLoading ? t("common.loading") : formatCurrency(trackingData?.summary?.totalRevenue || 0)}
            index={1}
          />
          <StatCard
            title={t("dashboard.filteredTransactions")}
            value={trackingLoading ? t("common.loading") : trackingData?.summary?.totalTransactions || 0}
            index={2}
          />
        </div>

        {!trackingLoading && !hasProductBreakdown ? <p className="muted">{t("dashboard.noDataFound")}</p> : null}

        {hasProductBreakdown ? (
          <table>
            <thead>
              <tr>
                <th>{t("dashboard.product")}</th>
                <th>{t("dashboard.totalItemsSold")}</th>
                <th>{t("dashboard.filteredRevenue")}</th>
              </tr>
            </thead>
            <tbody>
              {trackingData.byProduct.map((row) => (
                <tr key={row.productName}>
                  <td>{row.productName}</td>
                  <td>{row.itemsSold}</td>
                  <td>{formatCurrency(row.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </motion.div>
    </div>
  );
};
