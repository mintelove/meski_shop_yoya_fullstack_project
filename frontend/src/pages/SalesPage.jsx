import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { formatCurrency } from "../utils/currency";
import { useI18n } from "../context/I18nContext";

export const SalesPage = () => {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState({ productId: "", quantity: 1 });
  const [error, setError] = useState("");

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
    } catch (err) {
      setError(err.response?.data?.message || t("sales.failedComplete"));
    }
  };

  return (
    <div className="stack">
      <h2>{user?.role === "admin" ? t("sales.allSalesTitle") : t("sales.mySalesTitle")}</h2>

      <form className="card form-inline" onSubmit={onSale}>
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
        <button className="btn" type="submit">
          {t("sales.completeSale")}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

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
            {sales.map((sale) => (
              <tr key={sale._id}>
                <td>{new Date(sale.createdAt).toLocaleString(language === "am" ? "am-ET" : "en-US")}</td>
                <td>{sale.product_name}</td>
                <td>{sale.quantity}</td>
                <td>{formatCurrency(sale.unit_price)}</td>
                <td>{formatCurrency(sale.total_price)}</td>
                <td>{sale.salesman_id?.name || t("common.na")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
