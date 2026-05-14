import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { formatCurrency } from "../utils/currency";
import { useI18n } from "../context/I18nContext";

const defaultForm = {
  name: "",
  purchasedPrice: "",
  minSellingPrice: "",
  quantity: "",
  category: "",
  lowStockThreshold: 10
};

const StockBar = ({ current, initial, threshold, t }) => {
  const effectiveInitial = initial || current || 1;
  const sold = Math.max(0, effectiveInitial - current);
  const pct = Math.min(100, Math.round((current / effectiveInitial) * 100));
  const isLow = current <= (threshold ?? 10);
  const isWarning = !isLow && pct <= 35;

  let barClass = "stock-bar-fill stock-bar-fill--healthy";
  let statusClass = "stock-status stock-status--healthy";
  let statusText = t("products.healthy");

  if (isLow) {
    barClass = "stock-bar-fill stock-bar-fill--danger";
    statusClass = "stock-status stock-status--danger";
    statusText = t("products.lowStock");
  } else if (isWarning) {
    barClass = "stock-bar-fill stock-bar-fill--warning";
    statusClass = "stock-status stock-status--warning";
    statusText = t("products.lowStock");
  }

  return (
    <div className="stock-display">
      <span className="stock-fraction">{sold} / {effectiveInitial}</span>
      <div className="stock-bar">
        <div className={barClass} style={{ width: `${pct}%` }} />
      </div>
      <span className={statusClass}>{statusText}</span>
    </div>
  );
};

export const ProductsPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [message, setMessage] = useState("");
  const isAdmin = user?.role === "admin";

  const fetchProducts = useCallback(async () => {
    const res = await api.get("/products", {
      params: search ? { search } : {}
    });
    setProducts(res.data);
  }, [search]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get("/categories");
      setCategories(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  useSocket("stock:update", fetchProducts);

  const onSubmit = async (e) => {
    e.preventDefault();

    const purchasedPrice = Number(form.purchasedPrice) || 0;
    const minSellingPrice = Number(form.minSellingPrice) || 0;

    // Frontend cross-field validation
    if (minSellingPrice < purchasedPrice) {
      setMessage("");
      alert("Minimum selling price must be greater than or equal to purchased price");
      return;
    }

    const payload = {
      ...form,
      purchasedPrice,
      minSellingPrice,
      quantity: Number(form.quantity),
      lowStockThreshold: Number(form.lowStockThreshold)
    };

    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        setMessage(t("products.updatedSuccess") || "Product Updated Successfully");
      } else {
        await api.post("/products", payload);
        setMessage(t("products.addedSuccess") || "Product Added Successfully");
      }
      setForm(defaultForm);
      setEditingId(null);
      fetchProducts();
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      alert(err.response?.data?.message || "Operation failed");
    }
  };

  const onEdit = (product) => {
    setEditingId(product._id);
    setForm({
      name: product.name,
      purchasedPrice: product.purchasedPrice || 0,
      minSellingPrice: product.minSellingPrice || 0,
      quantity: product.quantity,
      category: product.category,
      lowStockThreshold: product.lowStockThreshold ?? 10
    });
  };

  const onDelete = async (id) => {
    await api.delete(`/products/${id}`);
    fetchProducts();
  };

  const onAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.post("/categories", { name: newCatName.trim() });
      setNewCatName("");
      fetchCategories();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to add category");
    }
  };

  const onDeleteCategory = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    try {
      await api.delete(`/categories/${id}`);
      fetchCategories();
    } catch (err) {
      alert("Failed to delete category");
    }
  };

  const csvExport = useMemo(() => {
    const rows = [
      [t("products.name"), t("products.category"), "Purchased Price", "Min Selling Price", t("products.quantity")],
      ...products.map((p) => {
        return [p.name, p.category, p.purchasedPrice || 0, p.minSellingPrice || 0, p.quantity];
      })
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
            placeholder="Purchased Price (Br)"
            value={form.purchasedPrice}
            onChange={(e) => setForm({ ...form, purchasedPrice: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Min Selling Price (Br)"
            value={form.minSellingPrice}
            onChange={(e) => setForm({ ...form, minSellingPrice: e.target.value })}
          />

          <input
            type="number"
            placeholder={t("products.quantity")}
            required
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <select
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">-- {t("products.category")} --</option>
            {categories.map((c) => (
              <option key={c._id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder={t("products.lowStockThreshold")}
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
          />
          <button className="btn" type="submit">
            {editingId ? t("common.updateProduct") : t("common.addProduct")}
          </button>
          {message && <p className="stock-status stock-status--healthy" style={{ marginTop: '0.8rem', fontWeight: '500' }}>{message}</p>}
        </form>
      )}

      {isAdmin && (
        <div className="card stack">
          <div className="row-between">
            <h4>{t("products.categoryManagement") || "Category Management"}</h4>
            <form onSubmit={onAddCategory} className="form-inline" style={{ marginBottom: 0 }}>
              <input
                placeholder={t("products.newCategory") || "New Category Name"}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
              />
              <button className="btn" type="submit">
                {t("common.create")}
              </button>
            </form>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
            {categories.map((cat) => (
              <div key={cat._id} className="row-between" style={{ padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', fontSize: '0.85rem' }}>
                <span>{cat.name}</span>
                <button
                  type="button"
                  onClick={() => onDeleteCategory(cat._id)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                >
                  &times;
                </button>
              </div>
            ))}
            {categories.length === 0 && <p className="muted" style={{ fontSize: '0.8rem' }}>No categories created yet.</p>}
          </div>
        </div>
      )}

      <div className="card">
        <a className="btn secondary" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvExport)}`} download="products.csv" style={{ display: 'inline-block', marginBottom: '0.8rem', textDecoration: 'none' }}>
          {t("products.exportCsv")}
        </a>
        <table>
          <thead>
            <tr>
              <th>{t("products.name")}</th>
              <th>{t("products.category")}</th>
              {isAdmin && <th>Purchased Price</th>}
              {isAdmin && <th>Min Selling Price</th>}
              <th>{t("products.stockLevel")}</th>
              <th>{t("products.status")}</th>
              {isAdmin ? <th>{t("products.actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product._id}>
                <td>{product.name}</td>
                <td>{product.category}</td>
                {isAdmin && <td>{formatCurrency(product.purchasedPrice || 0)}</td>}
                {isAdmin && <td>{formatCurrency(product.minSellingPrice || 0)}</td>}
                <td>
                  <StockBar
                    current={product.quantity}
                    initial={product.initialStock}
                    threshold={product.lowStockThreshold}
                    t={t}
                  />
                </td>
                <td>
                  {product.quantity <= (product.lowStockThreshold ?? 10) ? (
                    <span className="stock-status stock-status--danger">{t("products.lowStock")}</span>
                  ) : (
                    <span className="stock-status stock-status--healthy">{t("products.healthy")}</span>
                  )}
                </td>
                {isAdmin ? (
                  <td>
                    <button className="btn secondary" onClick={() => onEdit(product)}>
                      {t("common.edit")}
                    </button>
                    <button className="btn btn-danger" onClick={() => onDelete(product._id)} style={{ marginLeft: '0.4rem' }}>
                      {t("common.delete")}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
