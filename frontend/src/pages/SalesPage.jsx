import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { formatCurrency } from "../utils/currency";
import { useI18n } from "../context/I18nContext";

const SearchIcon = () => (
  <svg className="sales-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckmarkIcon = () => (
  <svg className="sale-success-checkmark" viewBox="0 0 52 52" fill="none" aria-hidden="true">
    <circle cx="26" cy="26" r="24" stroke="#28a745" strokeWidth="3" fill="none" />
    <path className="sale-success-check-path" d="M14 27l8 8 16-16" stroke="#28a745" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const SalesPage = () => {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState({ productId: "", quantity: 1 });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [saleSuccess, setSaleSuccess] = useState(false);
  const successTimer = useRef(null);

  const fetchData = useCallback(async () => {
    const [productsRes, salesRes] = await Promise.all([api.get("/products"), api.get("/sales")]);
    setProducts(productsRes.data);
    setSales(salesRes.data);
    if (!form.productId && productsRes.data[0]) {
      setForm((prev) => ({ ...prev, productId: productsRes.data[0]._id }));
    }
  }, [form.productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  useSocket("stock:update", fetchData);

  const onSale = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/sales", {
        productId: form.productId,
        quantity: Number(form.quantity)
      });
      setForm((prev) => ({ ...prev, quantity: 1 }));
      fetchData();

      // Trigger success state for 3 seconds
      setSaleSuccess(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSaleSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || t("sales.failedComplete"));
    }
  };

  // Real-time client-side search filtering
  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.toLowerCase().trim();
    return sales.filter((sale) => {
      const productMatch = (sale.product_name || "").toLowerCase().includes(q);
      const salesmanMatch = (sale.salesman_id?.name || "").toLowerCase().includes(q);
      const idMatch = (sale._id || "").toLowerCase().includes(q);
      const dateStr = new Date(sale.createdAt).toLocaleString(language === "am" ? "am-ET" : "en-US").toLowerCase();
      const dateMatch = dateStr.includes(q);
      return productMatch || salesmanMatch || idMatch || dateMatch;
    });
  }, [sales, search, language]);

  // CSV export handler
  const onExportCsv = () => {
    const params = new URLSearchParams();
    if (exportFrom) params.set("from", exportFrom);
    if (exportTo) params.set("to", exportTo);

    const token = localStorage.getItem("token");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    const url = `${baseUrl}/sales/export-csv?${params.toString()}`;

    // Use fetch with auth header then trigger download
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sales_export.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        setError(t("sales.exportFailed"));
      });
  };

  return (
    <div className="stack">
      <h2>{user?.role === "admin" ? t("sales.allSalesTitle") : t("sales.mySalesTitle")}</h2>

      <form
        className={`card form-inline sale-form-card${saleSuccess ? " sale-form-card--success" : ""}`}
        onSubmit={onSale}
      >
        {saleSuccess && (
          <div className="sale-success-overlay">
            <CheckmarkIcon />
            <p className="sale-success-text">Transaction Successful</p>
          </div>
        )}
        <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name} ({t("sales.stock")}: {p.quantity})
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          required
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        />
        <button className="btn" type="submit" disabled={saleSuccess}>
          {t("sales.completeSale")}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {/* CSV Export Toolbar */}
      <div className="card csv-export-bar">
        <div className="csv-export-group">
          <label>{t("sales.startDate")}</label>
          <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
        </div>
        <div className="csv-export-group">
          <label>{t("sales.endDate")}</label>
          <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
        </div>
        <button type="button" className="csv-export-btn" onClick={onExportCsv}>
          <DownloadIcon />
          {t("sales.exportCsv")}
        </button>
      </div>

      {/* Search Bar */}
      <div className="sales-search-wrap">
        <SearchIcon />
        <input
          className="sales-search-input"
          placeholder={t("sales.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t("sales.date")}</th>
              <th>{t("sales.product")}</th>
              <th>{t("sales.qty")}</th>
              <th>{t("sales.unitPrice")}</th>
              <th>{t("sales.total")}</th>
              <th>{t("sales.salesman")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-results">{t("sales.noResults")}</td>
              </tr>
            ) : (
              filteredSales.map((sale) => (
                <tr key={sale._id}>
                  <td>{new Date(sale.createdAt).toLocaleString(language === "am" ? "am-ET" : "en-US")}</td>
                  <td>{sale.product_name}</td>
                  <td>{sale.quantity}</td>
                  <td>{formatCurrency(sale.unit_price)}</td>
                  <td>{formatCurrency(sale.total_price)}</td>
                  <td>{sale.salesman_id?.name || t("common.na")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
