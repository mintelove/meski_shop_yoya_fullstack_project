import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingError, setTrackingError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [dateMode, setDateMode] = useState("single"); // "single" | "range"
  const [singleDate, setSingleDate] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [activeFilter, setActiveFilter] = useState("none");
  const [weekOffset, setWeekOffset] = useState(0);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  // Build current date filter params for API calls
  const getDateParams = useCallback(() => {
    if (dateMode === "single" && singleDate) {
      return { date: singleDate };
    }
    if (dateMode === "range" && (rangeFrom || rangeTo)) {
      const params = {};
      if (rangeFrom) params.startDate = rangeFrom;
      if (rangeTo) params.endDate = rangeTo;
      return params;
    }
    return {};
  }, [dateMode, singleDate, rangeFrom, rangeTo]);

  const fetchTopProducts = useCallback(async () => {
    try {
      const res = await api.get("/analytics/top-products", { params: getDateParams() });
      setTopProducts(res.data?.data || []);
    } catch {
      // silent – pie chart is supplementary
    }
  }, [getDateParams]);

  const fetchDashboard = useCallback(async () => {
    const endpoint = user?.role === "admin" ? "/dashboard/admin" : "/dashboard/salesman";
    if (!endpoint) return;
    try {
      setDashboardLoading(true);
      setError("");
      const params = { weekOffset, ...getDateParams() };
      const res = await api.get(endpoint, { params });
      setData(res.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || t("dashboard.loadFailed"));
    } finally {
      setDashboardLoading(false);
    }
  }, [t, user?.role, weekOffset, getDateParams]);

  const fetchSalesTracking = useCallback(async () => {
    try {
      setTrackingLoading(true);
      setTrackingError("");
      const dateParams = getDateParams();
      // Map to legacy params the backend expects
      const params = {};
      if (dateParams.date) params.date = dateParams.date;
      if (dateParams.startDate) params.from = dateParams.startDate;
      if (dateParams.endDate) params.to = dateParams.endDate;
      const res = await api.get("/dashboard/sales-tracking", { params });
      setTrackingData(res.data);
    } catch (requestError) {
      setTrackingError(requestError.response?.data?.message || t("dashboard.salesTrackingFailed"));
    } finally {
      setTrackingLoading(false);
    }
  }, [t, getDateParams]);

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

  // Fetch all data on mount and when dependencies change
  useEffect(() => {
    fetchDashboard();
    fetchSalesTracking();
    fetchLowStock();
    fetchTopProducts();
  }, [fetchDashboard, fetchSalesTracking, fetchLowStock, fetchTopProducts]);

  useSocket("stock:update", () => {
    fetchDashboard();
    fetchLowStock();
  });

  const metrics = useMemo(() => {
    if (!data) return [];
    const base = [
      {
        title: t("dashboard.dailySales"),
        value: formatCurrency(data?.dailySales ?? data?.daily?.amount ?? 0),
        subtitle: `${data?.totalTransactions ?? data?.daily?.count ?? 0} ${t("dashboard.transactions")}`
      },
      {
        title: t("dashboard.weeklySales"),
        value: formatCurrency(data?.weekly?.amount || 0),
        subtitle: `${data?.weekly?.count || 0} ${t("dashboard.transactions")}`
      },
      {
        title: t("dashboard.totalItemsSold") || "Items Sold",
        value: data?.totalItemsSold ?? data?.daily?.itemsSold ?? 0,
        subtitle: t("dashboard.allCompletedSales") || "Total units sold"
      }
    ];

    if (user?.role === "admin") {
      return [
        ...base,
        { title: t("dashboard.totalRevenue"), value: formatCurrency(data?.totalRevenue || 0), subtitle: t("dashboard.allCompletedSales") },
        { title: t("dashboard.productsCount"), value: data?.productsCount || 0, subtitle: t("dashboard.catalogItems") },
        { title: t("dashboard.stockUnits"), value: data?.stockUnits || 0, subtitle: t("dashboard.availableInventoryUnits") },
        { title: t("dashboard.lowStockAlerts"), value: data?.lowStockAlerts || 0, subtitle: t("dashboard.needsRestockSoon") }
      ];
    }

    return [
      ...base,
      { title: t("dashboard.totalRevenue"), value: formatCurrency(data?.totalRevenue || 0), subtitle: t("dashboard.allCompletedSales") },
      { title: t("dashboard.remainingStockUnits"), value: data?.remainingStockUnits || 0, subtitle: t("dashboard.globalStockQuantity") }
    ];
  }, [data, t, user?.role]);

  const onApplyFilter = async () => {
    if (dateMode === "single" && singleDate) {
      setActiveFilter("single");
    } else if (dateMode === "range" && (rangeFrom || rangeTo)) {
      if (rangeFrom && rangeTo && rangeTo < rangeFrom) {
        setTrackingError(t("dashboard.invalidRange"));
        return;
      }
      setActiveFilter("range");
    } else {
      setActiveFilter("none");
    }
    // Global refresh – all data sources use getDateParams()
    await Promise.all([
      fetchDashboard(),
      fetchSalesTracking(),
      fetchTopProducts()
    ]);
  };

  const onResetFilter = async () => {
    setSingleDate("");
    setRangeFrom("");
    setRangeTo("");
    setActiveFilter("none");
    setTrackingError("");
  };

  // After reset state, useEffect triggers re-fetch automatically via dependency change

  const handleExport = (format) => {
    const params = new URLSearchParams();
    const dateParams = getDateParams();
    if (dateParams.date) params.set("date", dateParams.date);
    if (dateParams.startDate) params.set("startDate", dateParams.startDate);
    if (dateParams.endDate) params.set("endDate", dateParams.endDate);
    const token = localStorage.getItem("token");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    fetch(`${baseUrl}/reports/export/${format}?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `report_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setTrackingError(`${format.toUpperCase()} export failed`));
  };

  const hasProductBreakdown = (trackingData?.byProduct || []).length > 0;
  const canGoNextWeek = weekOffset > 0;
  const isLoading = dashboardLoading || trackingLoading;

  if (!data && !error) return <div>{t("common.loading")}</div>;

  return (
    <div className="stack">
      <div className="row-between dashboard-header" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          style={{ margin: 0 }}
        >
          {user?.role === "admin" ? t("dashboard.adminTitle") : t("dashboard.myTitle")}
        </motion.h2>

        <div className="form dashboard-filter-row" style={{ marginLeft: "auto", marginBottom: 0, alignItems: "flex-end", flexWrap: "wrap", gap: "0.5rem" }}>
          {/* Toggle button */}
          <button
            className="btn btn-toggle"
            type="button"
            onClick={() => {
              setDateMode((prev) => (prev === "single" ? "range" : "single"));
              setSingleDate("");
              setRangeFrom("");
              setRangeTo("");
            }}
            style={{ whiteSpace: "nowrap" }}
          >
            {dateMode === "single"
              ? (t("dashboard.switchToRange") || "📅 Single Date | Range Date →")
              : (t("dashboard.switchToSingle") || "← Single Date | Range Date 📅")}
          </button>

          {/* Date pickers */}
          {dateMode === "single" ? (
            <label className="dashboard-filter-group">
              <span className="muted">{t("dashboard.singleDate")}</span>
              <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
            </label>
          ) : (
            <>
              <label className="dashboard-filter-group">
                <span className="muted">{t("dashboard.fromDate")}</span>
                <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </label>
              <label className="dashboard-filter-group">
                <span className="muted">{t("dashboard.toDate")}</span>
                <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </label>
            </>
          )}

          <button className="btn btn-apply" type="button" onClick={onApplyFilter} disabled={isLoading}>
            {isLoading ? (t("common.loading") || "Loading...") : t("dashboard.applyFilter")}
          </button>
          <button className="btn btn-reset" type="button" onClick={onResetFilter} disabled={isLoading}>
            {t("dashboard.resetFilter")}
          </button>
          <button className="btn btn-pdf" type="button" onClick={() => handleExport("pdf")} disabled={isLoading}>
            {t("dashboard.exportPdf") || "Export PDF"}
          </button>
          <button className="btn btn-csv" type="button" onClick={() => handleExport("csv")} disabled={isLoading}>
            {t("dashboard.exportCsv") || "Export CSV"}
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {/* Loading indicator */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ textAlign: "center", padding: "0.5rem", color: "#10b981", fontWeight: 500 }}
        >
          {t("common.loading") || "Loading..."}
        </motion.div>
      )}

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
            <button className="btn btn-nav" type="button" onClick={() => setWeekOffset((prev) => prev + 1)}>
              {t("dashboard.previousWeek")}
            </button>
            <button className="btn btn-nav" type="button" onClick={() => setWeekOffset((prev) => Math.max(prev - 1, 0))} disabled={!canGoNextWeek}>
              {t("dashboard.nextWeek")}
            </button>
          </div>
        </motion.div>
        <TransactionChartCard title={t("dashboard.dailyTrend")} data={data?.dailyWeekTrend || []} type="daily" t={t} />
        <TransactionChartCard title={t("dashboard.weeklyPerformance")} data={data?.weeklyPerformance || []} type="weekly" t={t} />

        {topProducts.length > 0 && (
          <motion.div
            className="card dashboard-chart-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.35 }}
          >
            <h4>{t("dashboard.topProducts") || "Top Selling Products"}</h4>
            <div className="dashboard-chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={topProducts}
                    dataKey="totalSold"
                    nameKey="productName"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ productName, totalSold }) => `${productName} (${totalSold})`}
                    animationEasing="ease-in-out"
                  >
                    {topProducts.map((entry, index) => (
                      <Cell
                        key={entry.productName}
                        fill={["#10b981", "#0d9488", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#f97316"][index % 10]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </div>

      <motion.div
        className="card stack dashboard-tracking-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <h3>{t("dashboard.salesTrackingTitle")}</h3>
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
            value={trackingLoading ? t("common.loading") : (trackingData?.summary?.totalItemsSold ?? 0)}
            index={0}
          />
          <StatCard
            title={t("dashboard.filteredRevenue")}
            value={trackingLoading ? t("common.loading") : formatCurrency(trackingData?.summary?.totalRevenue ?? 0)}
            index={1}
          />
          <StatCard
            title={t("dashboard.filteredTransactions")}
            value={trackingLoading ? t("common.loading") : (trackingData?.summary?.totalTransactions ?? 0)}
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
