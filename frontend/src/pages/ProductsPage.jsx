import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { formatCurrency } from "../utils/currency";
import { useI18n } from "../context/I18nContext";

const defaultForm = {
  name: "",
  price: "",
  quantity: "",
  category: "",
  lowStockThreshold: 10
};

export const ProductsPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const isAdmin = user?.role === "admin";

  const fetchProducts = useCallback(async () => {
    const res = await api.get("/products", {
      params: search ? { search } : {}
    });
    setProducts(res.data);
  }, [search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useSocket("stock:update", fetchProducts);

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price),
      quantity: Number(form.quantity),
      lowStockThreshold: Number(form.lowStockThreshold)
    };

    if (editingId) {
      await api.put(`/products/${editingId}`, payload);
    } else {
      await api.post("/products", payload);
    }
    setForm(defaultForm);
    setEditingId(null);
    fetchProducts();
  };

  const onEdit = (product) => {
    setEditingId(product._id);
    setForm({
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      category: product.category,
      lowStockThreshold: product.lowStockThreshold ?? 10
    });
  };

  const onDelete = async (id) => {
    await api.delete(`/products/${id}`);
    fetchProducts();
  };

  const csvExport = useMemo(() => {
    const rows = [
      [t("products.name"), t("products.category"), t("products.priceEtdHeader"), t("products.quantity")],
      ...products.map((p) => [p.name, p.category, p.price, p.quantity])
    ];
    return rows.map((row) => row.join(",")).join("\n");
  }, [products, t]);

  return (
    <div className="stack">
      <div className="row-between">
        <h2>{t("products.title")}</h2>
        <input placeholder={t("common.searchProducts")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isAdmin && (
        <form className="card form-inline" onSubmit={onSubmit}>
          <input placeholder={t("products.name")} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            type="number"
            step="0.01"
            placeholder={t("products.priceBr")}
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("products.quantity")}
            required
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <input
            placeholder={t("products.category")}
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            type="number"
            placeholder={t("products.lowStockThreshold")}
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
          />
          <button className="btn" type="submit">
            {editingId ? t("common.updateProduct") : t("common.addProduct")}
          </button>
        </form>
      )}

      <div className="card">
        <a className="btn secondary" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvExport)}`} download="products.csv">
          {t("products.exportCsv")}
        </a>
        <table>
          <thead>
            <tr>
              <th>{t("products.name")}</th>
              <th>{t("products.category")}</th>
              <th>{t("products.priceHeader")}</th>
              <th>{t("products.qtyHeader")}</th>
              <th>{t("products.status")}</th>
              {isAdmin ? <th>{t("products.actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isLow = product.quantity <= (product.lowStockThreshold ?? 10);
              return (
                <tr key={product._id}>
                  <td>{product.name}</td>
                  <td>{product.category}</td>
                  <td>{formatCurrency(product.price)}</td>
                  <td>{product.quantity}</td>
                  <td>{isLow ? t("products.lowStock") : t("products.healthy")}</td>
                  {isAdmin ? (
                    <td>
                      <button className="btn secondary" onClick={() => onEdit(product)}>
                        {t("common.edit")}
                      </button>
                      <button className="btn btn-danger" onClick={() => onDelete(product._id)}>
                        {t("common.delete")}
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
