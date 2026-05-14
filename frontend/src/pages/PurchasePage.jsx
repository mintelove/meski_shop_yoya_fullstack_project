import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { formatCurrency } from "../utils/currency";
import { useI18n } from "../context/I18nContext";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../context/AuthContext";

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ONE_HOUR = 60 * 60 * 1000;

const statusBadge = (status) => {
  const colors = { active: "#22c55e", returned: "#f59e0b", reversed: "#ef4444" };
  return (
    <span style={{
      display: "inline-block", padding: "0.15rem 0.5rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700,
      background: `${colors[status] || "#94a3b8"}22`, color: colors[status] || "#94a3b8", textTransform: "uppercase"
    }}>{status}</span>
  );
};

const adminPriceBadge = (price) => (
  <div style={{
    padding: "0.4rem 0.7rem", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600,
    background: "rgba(59,130,246,0.08)", color: "#2563eb", border: "1px solid rgba(59,130,246,0.15)",
    marginBottom: "0.5rem"
  }}>
    💰 Admin Price: <strong>Br {Number(price).toFixed(2)}</strong>
  </div>
);

export const PurchasePage = () => {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState({ transactions: [], byProduct: [], totalProfit: 0 });
  const [dateFilter, setDateFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");

  // Edit modal
  const [editTx, setEditTx] = useState(null);
  const [editForm, setEditForm] = useState({ sellingPrice: "" });
  const [editError, setEditError] = useState("");

  // Request modal (cashback / price change)
  const [reqTx, setReqTx] = useState(null);
  const [reqType, setReqType] = useState("cashback");
  const [reqReason, setReqReason] = useState("");
  const [reqNewPrice, setReqNewPrice] = useState("");
  const [reqError, setReqError] = useState("");
  const [reqSuccess, setReqSuccess] = useState("");

  // Admin: edit requests
  const [editRequests, setEditRequests] = useState([]);
  // Salesman: own edit requests (for button state)
  const [myRequests, setMyRequests] = useState([]);

  const fetchData = useCallback(async () => {
    const params = {};
    if (dateFilter) params.date = dateFilter;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    try {
      const res = await api.get("/sales/purchases", { params });
      setData(res.data);
    } catch { /* silent */ }
  }, [dateFilter, startDate, endDate]);

  const fetchEditRequests = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/edit-requests");
      setEditRequests(res.data);
    } catch { /* silent */ }
  }, [isAdmin]);

  const fetchMyRequests = useCallback(async () => {
    if (isAdmin) return;
    try {
      const res = await api.get("/edit-requests/mine");
      setMyRequests(res.data);
    } catch { /* silent */ }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
    fetchEditRequests();
    fetchMyRequests();
    const interval = setInterval(() => { fetchData(); fetchMyRequests(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, fetchEditRequests, fetchMyRequests]);

  useSocket("stock:update", () => { fetchData(); fetchEditRequests(); fetchMyRequests(); });

  // Get the latest request for a transaction
  const getRequestStatus = (txId) => {
    const reqs = myRequests.filter(r => String(r.transaction_id?._id || r.transaction_id) === String(txId));
    if (reqs.length === 0) return null;
    const sorted = [...reqs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted[0];
  };

  const filteredTransactions = useMemo(() => {
    if (!search.trim()) return data.transactions;
    const q = search.toLowerCase().trim();
    return data.transactions.filter((tx) =>
      (tx.product_name || "").toLowerCase().includes(q) || (tx.salesman || "").toLowerCase().includes(q)
    );
  }, [data.transactions, search]);

  const onExport = (format) => {
    const params = new URLSearchParams();
    if (dateFilter) params.set("date", dateFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const token = localStorage.getItem("token");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    const url = `${baseUrl}/sales/purchases/export/${format}?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `profit_report_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  };

  // Permission: can salesman edit price (within 1hr, operationUsed=false)
  const canEditPrice = (tx) => {
    if (tx.status !== "active") return false;
    if (isAdmin) return true;
    const isOwner = String(tx.salesman_id) === String(user?._id);
    if (!isOwner || tx.operationUsed) return false;
    return (Date.now() - new Date(tx.date).getTime()) <= ONE_HOUR;
  };

  // Permission: can salesman send request (operationUsed=false, after 1hr OR within 1hr for return)
  const canSendRequest = (tx) => {
    if (tx.status !== "active") return false;
    if (isAdmin) return false;
    const isOwner = String(tx.salesman_id) === String(user?._id);
    if (!isOwner || tx.operationUsed) return false;
    return true; // Can always request if operationUsed=false
  };

  // Edit price
  const onEditSubmit = async () => {
    setEditError("");
    try {
      await api.put(`/sales/${editTx._id}`, { sellingPrice: Number(editForm.sellingPrice) });
      setEditTx(null);
      fetchData();
    } catch (err) {
      setEditError(err.response?.data?.message || "Edit failed.");
    }
  };

  // Submit request (cashback = return request, price_change)
  const onReqSubmit = async () => {
    setReqError(""); setReqSuccess("");
    try {
      const body = { transactionId: reqTx._id, type: reqType, reason: reqReason };
      if (reqType === "price_change") body.newPrice = Number(reqNewPrice);
      await api.post("/edit-requests", body);
      setReqSuccess("Request submitted!");
      fetchMyRequests();
      fetchData();
      setTimeout(() => { setReqTx(null); setReqReason(""); setReqNewPrice(""); setReqSuccess(""); }, 1500);
    } catch (err) {
      setReqError(err.response?.data?.message || "Request failed.");
    }
  };

  // Admin: approve/reject
  const onReview = async (id, status) => {
    try {
      await api.patch(`/edit-requests/${id}`, { status });
      fetchEditRequests();
      fetchData();
    } catch { /* silent */ }
  };

  const profitCardClass = data.totalProfit > 0
    ? "profit-total-card"
    : data.totalProfit < 0 ? "profit-total-card profit-total-card--negative" : "profit-total-card profit-total-card--zero";

  const pendingRequests = editRequests.filter(r => r.status === "pending");

  // Render action buttons for a transaction
  const renderActions = (tx) => {
    // Admin always gets edit
    if (isAdmin) {
      return (
        <button className="btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
          onClick={() => { setEditTx(tx); setEditForm({ sellingPrice: tx.sellingPrice }); setEditError(""); }}>
          ✏️ Edit
        </button>
      );
    }

    // Not owner
    const isOwner = String(tx.salesman_id) === String(user?._id);
    if (!isOwner || tx.status !== "active") return null;

    // Operation already used — check request status
    if (tx.operationUsed) {
      const latestReq = getRequestStatus(tx._id);
      if (latestReq && latestReq.status === "pending") {
        return (
          <span style={{
            display: "inline-block", padding: "0.2rem 0.5rem", fontSize: "0.7rem",
            color: "#f59e0b", fontWeight: 600, lineHeight: "1.3"
          }}>
            ⏳ Requested, please wait until approved by admin
          </span>
        );
      }
      return (
        <span style={{
          display: "inline-block", padding: "0.2rem 0.5rem", fontSize: "0.72rem",
          color: "#94a3b8", fontWeight: 600
        }}>
          🔒 Action already used
        </span>
      );
    }

    const withinHour = (Date.now() - new Date(tx.date).getTime()) <= ONE_HOUR;

    // Within 1 hour: show Edit Price + Return (as request)
    if (withinHour) {
      return (
        <>
          <button className="btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", marginRight: "0.25rem" }}
            onClick={() => { setEditTx(tx); setEditForm({ sellingPrice: tx.sellingPrice }); setEditError(""); }}>
            ✏️ Edit Price
          </button>
          <button className="btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#f59e0b" }}
            onClick={() => { setReqTx(tx); setReqType("cashback"); setReqReason(""); setReqNewPrice(""); setReqError(""); setReqSuccess(""); }}>
            ↩️ Return
          </button>
        </>
      );
    }

    // After 1 hour: show Request button
    return (
      <button className="btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#8b5cf6" }}
        onClick={() => { setReqTx(tx); setReqType("cashback"); setReqReason(""); setReqNewPrice(""); setReqError(""); setReqSuccess(""); }}>
        📝 Send Request
      </button>
    );
  };

  return (
    <div className="stack">
      <h2>{t("nav.purchases")}</h2>

      {/* Date Filters + Export */}
      <div className="card csv-export-bar" style={{ flexWrap: "wrap", gap: "1rem" }}>
        <div className="csv-export-group">
          <label>{t("dashboard.singleDate")}</label>
          <input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setStartDate(""); setEndDate(""); }} />
        </div>
        <div className="csv-export-group">
          <label>{t("sales.startDate")}</label>
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDateFilter(""); }} />
        </div>
        <div className="csv-export-group">
          <label>{t("sales.endDate")}</label>
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDateFilter(""); }} />
        </div>
        <div className="csv-export-group" style={{ alignSelf: "flex-end" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", background: "#64748b", color: "#fff", borderRadius: "8px", border: "none", cursor: "pointer" }}
            onClick={() => { setDateFilter(""); setStartDate(""); setEndDate(""); }}>
            {t("dashboard.resetFilter")}
          </button>
        </div>
        <div className="profit-export-row">
          <button type="button" className="csv-export-btn" onClick={() => onExport("csv")}>
            <DownloadIcon /> {t("sales.exportCsv")}
          </button>
          <button type="button" className="csv-export-btn" style={{ background: "linear-gradient(135deg, #e11d48, #be123c)" }} onClick={() => onExport("pdf")}>
            <DownloadIcon /> {t("dashboard.exportPdf")}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        {/* Total Profit Card */}
        <div className={profitCardClass}>
          <p className="profit-total-label">{t("sales.totalProfit")}</p>
          <p className="profit-total-value">{formatCurrency(data.totalProfit)}</p>
          <p className="profit-total-subtitle">
            {data.transactions.filter(tx => tx.status === "active").length} {t("dashboard.transactions")}
          </p>
        </div>

        {/* Total Items Sold Card */}
        <div className="profit-total-card" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", borderColor: "rgba(255,255,255,0.1)" }}>
          <p className="profit-total-label" style={{ color: "rgba(255,255,255,0.9)" }}>Total Items Sold</p>
          <p className="profit-total-value" style={{ color: "#fff" }}>{data.totalItemsSold || 0}</p>
          <p className="profit-total-subtitle" style={{ color: "rgba(255,255,255,0.8)" }}>
            Across all {data.transactions.filter(tx => tx.status === "active").length} active transactions
          </p>
        </div>
      </div>

      {/* Admin: Pending Edit Requests */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="card profit-table-card">
          <h3 style={{ marginBottom: "0.8rem" }}>📋 {t("sales.pendingEditRequests")} ({pendingRequests.length})</h3>
          <table>
            <thead>
              <tr>
                <th>{t("sales.salesman")}</th>
                <th>{t("sales.product")}</th>
                <th>Type</th>
                <th>{t("sales.reason")}</th>
                <th>New Price</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((r) => (
                <tr key={r._id}>
                  <td>{r.salesman_id?.name || "N/A"}</td>
                  <td>{r.transaction_id?.product_name || "N/A"}</td>
                  <td>{statusBadge(r.type)}</td>
                  <td>{r.reason}</td>
                  <td>{r.type === "price_change" && r.newPrice ? formatCurrency(r.newPrice) : "—"}</td>
                  <td>{new Date(r.createdAt).toLocaleString(language === "am" ? "am-ET" : "en-US")}</td>
                  <td style={{ display: "flex", gap: "0.3rem" }}>
                    <button className="btn" style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} onClick={() => onReview(r._id, "approved")}>{t("sales.approve")}</button>
                    <button className="btn btn-danger" style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} onClick={() => onReview(r._id, "rejected")}>{t("sales.reject")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Profit Per Product */}
      <div className="card profit-table-card">
        <h3 style={{ marginBottom: "0.8rem" }}>{t("sales.profitPerProduct")}</h3>
        <table>
          <thead>
            <tr>
              <th>{t("sales.product")}</th>
              <th>{t("sales.qty")}</th>
              <th>{t("sales.totalProfit")}</th>
            </tr>
          </thead>
          <tbody>
            {data.byProduct.length === 0 ? (
              <tr><td colSpan={3} className="no-results">{t("sales.noResults")}</td></tr>
            ) : (
              data.byProduct.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.product_name}</td>
                  <td>{item.totalQuantity}</td>
                  <td style={{ fontWeight: 600, color: item.totalProfit > 0 ? "#22c55e" : item.totalProfit < 0 ? "#ef4444" : "#94a3b8" }}>
                    {formatCurrency(item.totalProfit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* All Transactions */}
      <div className="card profit-table-card">
        <h3 style={{ marginBottom: "0.8rem" }}>{t("sales.allTransactions")}</h3>
        <div className="sales-search-wrap" style={{ marginBottom: "0.8rem" }}>
          <input className="sales-search-input" placeholder={t("sales.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th>{t("sales.date")}</th>
              <th>{t("sales.product")}</th>
              <th>{t("sales.qty")}</th>
              <th>{t("sales.unitPrice")}</th>
              <th>{t("products.priceBr")}</th>
              <th>{t("sales.totalProfit")}</th>
              <th>{t("sales.salesman")}</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr><td colSpan={9} className="no-results">{t("sales.noResults")}</td></tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx._id} style={tx.status !== "active" ? { opacity: 0.55 } : undefined}>
                  <td>{new Date(tx.date).toLocaleString(language === "am" ? "am-ET" : "en-US")}</td>
                  <td>{tx.product_name}</td>
                  <td>{tx.quantity}</td>
                  <td>{formatCurrency(tx.sellingPrice)}</td>
                  <td>{formatCurrency(tx.purchasedPrice)}</td>
                  <td style={{ fontWeight: 600, color: tx.profit > 0 ? "#22c55e" : tx.profit < 0 ? "#ef4444" : "#94a3b8" }}>
                    {formatCurrency(tx.profit)}
                  </td>
                  <td>{tx.salesman}</td>
                  <td>
                    {statusBadge(tx.status)}
                    {tx.adminMessage && (
                      <div style={{ marginTop: "0.2rem", fontSize: "0.72rem", color: "#dc2626", fontWeight: 600 }}>
                        ⚠️ {tx.adminMessage}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {renderActions(tx)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Price Modal */}
      {editTx && (
        <div className="modal-backdrop" onClick={() => setEditTx(null)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>✏️ {t("sales.editTransaction")}</h3>
            <p style={{ margin: "0.4rem 0", color: "var(--muted)" }}>{editTx.product_name}</p>
            {adminPriceBadge(editTx.minSellingPrice)}
            {editError && <p className="error" style={{ margin: "0.4rem 0" }}>{editError}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem" }}>Selling Price</label>
                <input type="number" min="0.01" step="0.01" value={editForm.sellingPrice}
                  onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })} style={{ width: "100%" }} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                <button className="btn" onClick={onEditSubmit}>{t("sales.save")}</button>
                <button className="btn" style={{ background: "#64748b" }} onClick={() => setEditTx(null)}>{t("sales.cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request Modal (Cashback / Price Change) */}
      {reqTx && (
        <div className="modal-backdrop" onClick={() => setReqTx(null)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>📝 {t("sales.requestEditPermission")}</h3>
            <p style={{ margin: "0.4rem 0", color: "var(--muted)" }}>{reqTx.product_name} — {new Date(reqTx.date).toLocaleDateString()}</p>
            {adminPriceBadge(reqTx.minSellingPrice)}
            {reqError && <p className="error" style={{ margin: "0.4rem 0" }}>{reqError}</p>}
            {reqSuccess && <p style={{ margin: "0.4rem 0", color: "#22c55e", fontWeight: 600 }}>{reqSuccess}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem" }}>Request Type</label>
                <select value={reqType} onChange={(e) => setReqType(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--input-text)", fontSize: "0.92rem" }}>
                  <option value="cashback">💰 Cashback (Return + Refund)</option>
                  <option value="price_change">💲 Price Change</option>
                </select>
              </div>
              {reqType === "price_change" && (
                <div>
                  <label style={{ fontSize: "0.85rem" }}>New Price</label>
                  <input type="number" min="0.01" step="0.01" value={reqNewPrice}
                    onChange={(e) => setReqNewPrice(e.target.value)} style={{ width: "100%" }} />
                </div>
              )}
              <div>
                <label style={{ fontSize: "0.85rem" }}>{t("sales.reason")}</label>
                <textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} rows={3}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "8px", border: "1px solid var(--input-border)", background: "var(--input-bg)", color: "var(--input-text)", fontFamily: "inherit", fontSize: "0.92rem", resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn" onClick={onReqSubmit} disabled={!reqReason.trim()}>{t("sales.submitRequest")}</button>
                <button className="btn" style={{ background: "#64748b" }} onClick={() => setReqTx(null)}>{t("sales.cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
