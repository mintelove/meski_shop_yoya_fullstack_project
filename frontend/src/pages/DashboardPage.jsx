import { useCallback, useEffect, useMemo, useState } from "react";
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

const StatCard = ({ title, value, subtitle }) => (
  <div className="card stat-card dashboard-stat-card">
    <p className="dashboard-stat-title">{title}</p>
    <p className="dashboard-stat-value">{value}</p>
    {subtitle ? <p className="muted dashboard-stat-subtitle">{subtitle}</p> : null}
  </div>
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
    <div className="card dashboard-chart-card">
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
                <Bar dataKey="itemsSold" name={t("dashboard.itemsSoldLegend")} fill="#335dff" radius={[5, 5, 0, 0]} />
                <Bar dataKey="revenue" name={t("dashboard.revenueLegend")} fill="#16a34a" radius={[5, 5, 0, 0]} />
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
                  stroke="#335dff"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={t("dashboard.revenueLegend")}
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
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

  useEffect(() => {
    fetchDashboard();
    fetchSalesTracking();
  }, [fetchDashboard, fetchSalesTracking]);

  useSocket("stock:update", fetchDashboard);

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
      <h2>{user?.role === "admin" ? t("dashboard.adminTitle") : t("dashboard.myTitle")}</h2>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid dashboard-metrics-grid">
        {metrics.map((metric) => (
          <StatCard key={metric.title} title={metric.title} value={metric.value} subtitle={metric.subtitle} />
        ))}
      </div>
      <div className="grid dashboard-chart-grid">
        <div className="card row-between dashboard-chart-controls">
          <h4>{t("dashboard.chartRangeTitle")}</h4>
          <div className="form-inline">
            <button className="btn secondary" type="button" onClick={() => setWeekOffset((prev) => prev + 1)}>
              {t("dashboard.previousWeek")}
            </button>
            <button className="btn secondary" type="button" onClick={() => setWeekOffset((prev) => Math.max(prev - 1, 0))} disabled={!canGoNextWeek}>
              {t("dashboard.nextWeek")}
            </button>
          </div>
        </div>
        <TransactionChartCard title={t("dashboard.dailyTrend")} data={data?.dailyWeekTrend || []} type="daily" t={t} />
        <TransactionChartCard title={t("dashboard.weeklyPerformance")} data={data?.weeklyPerformance || []} type="weekly" t={t} />
      </div>

      <div className="card stack">
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
          />
          <StatCard
            title={t("dashboard.filteredRevenue")}
            value={trackingLoading ? t("common.loading") : formatCurrency(trackingData?.summary?.totalRevenue || 0)}
          />
          <StatCard
            title={t("dashboard.filteredTransactions")}
            value={trackingLoading ? t("common.loading") : trackingData?.summary?.totalTransactions || 0}
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
      </div>
    </div>
  );
};
