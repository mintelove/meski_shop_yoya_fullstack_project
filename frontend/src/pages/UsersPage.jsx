import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "salesman"
};

const initialProfileForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: ""
};

export const UsersPage = () => {
  const { t } = useI18n();
  const { user, logout, refreshUser } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [users, setUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [tableMessage, setTableMessage] = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await api.get("/auth/users");
    setUsers(res.data);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        name: user.name || "",
        email: user.email || ""
      }));
    }
  }, [user]);

  const salesmanUsers = useMemo(() => users.filter((account) => account.role === "salesman"), [users]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/auth/users", form);
      setMessage(t("users.created"));
      setForm(initialForm);
      fetchUsers();
    } catch (err) {
      const apiMessage = err.response?.data?.message;
      const validationErrors = err.response?.data?.errors;
      if (Array.isArray(validationErrors) && validationErrors.length > 0) {
        const details = validationErrors
          .map((error) => `${error.path}: ${error.msg}`)
          .join(" | ");
        setMessage(`${t("users.validationPrefix")} ${details}`);
      } else {
        setMessage(apiMessage || t("users.failed"));
      }
    }
  };

  const onToggleStatus = async (targetUser) => {
    setTableMessage("");
    await api.patch(`/auth/users/${targetUser._id}/status`, { isActive: !targetUser.isActive });
    setTableMessage(targetUser.isActive ? t("users.deactivated") : t("users.activated"));
    fetchUsers();
  };

  const onStartEdit = (targetUser) => {
    setEditingId(targetUser._id);
    setEditForm({ name: targetUser.name, email: targetUser.email, password: "" });
  };

  const onSaveEdit = async (targetUser) => {
    setTableMessage("");
    const payload = { name: editForm.name, email: editForm.email };
    if (editForm.password) payload.password = editForm.password;
    await api.patch(`/auth/users/${targetUser._id}`, payload);
    setTableMessage(t("users.updated"));
    setEditingId(null);
    setEditForm({ name: "", email: "", password: "" });
    fetchUsers();
  };

  const onUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMessage("");
    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      setProfileMessage(t("users.passwordMismatch"));
      return;
    }
    const payload = { name: profileForm.name, email: profileForm.email };
    if (profileForm.password) payload.password = profileForm.password;
    await api.patch("/auth/me", payload);
    setProfileMessage(t("users.profileUpdated"));
    if (profileForm.password) {
      logout();
    } else {
      await refreshUser();
      fetchUsers();
    }
  };

  return (
    <div className="stack">
      <h2>{t("users.title")}</h2>
      <form className="card form" onSubmit={onSubmit}>
        <input placeholder={t("products.name")} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input
          type="email"
          placeholder={t("auth.email")}
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          type="password"
          placeholder={t("auth.password")}
          minLength={6}
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="salesman">{t("common.salesman")}</option>
          <option value="admin">{t("common.admin")}</option>
        </select>
        <button className="btn" type="submit">
          {t("users.createBtn")}
        </button>
        {message ? <p className="muted">{message}</p> : null}
      </form>

      <div className="card">
        <h3>{t("users.salesmanAccounts")}</h3>
        {tableMessage ? <p className="muted">{tableMessage}</p> : null}
        <table>
          <thead>
            <tr>
              <th>{t("products.name")}</th>
              <th>{t("auth.email")}</th>
              <th>{t("users.status")}</th>
              <th>{t("products.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {salesmanUsers.map((account) => {
              const isEditing = editingId === account._id;
              return (
                <tr key={account._id}>
                  <td>
                    {isEditing ? (
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    ) : (
                      account.name
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                    ) : (
                      account.email
                    )}
                  </td>
                  <td>{account.isActive ? t("users.active") : t("users.inactive")}</td>
                  <td>
                    {isEditing ? (
                      <>
                        <input
                          type="password"
                          minLength={6}
                          placeholder={t("users.newPasswordOptional")}
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        />
                        <button className="btn" onClick={() => onSaveEdit(account)}>
                          {t("users.save")}
                        </button>
                        <button className="btn secondary" onClick={() => setEditingId(null)}>
                          {t("users.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn secondary" onClick={() => onStartEdit(account)}>
                          {t("common.edit")}
                        </button>
                        <button className={`btn ${account.isActive ? "btn-danger" : ""}`} onClick={() => onToggleStatus(account)}>
                          {account.isActive ? t("users.deactivate") : t("users.activate")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form className="card form" onSubmit={onUpdateProfile}>
        <h3>{t("users.adminAccount")}</h3>
        <input
          placeholder={t("products.name")}
          required
          value={profileForm.name}
          onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
        />
        <input
          type="email"
          placeholder={t("auth.email")}
          required
          value={profileForm.email}
          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
        />
        <input
          type="password"
          minLength={6}
          placeholder={t("users.newPasswordOptional")}
          value={profileForm.password}
          onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
        />
        <input
          type="password"
          minLength={6}
          placeholder={t("users.confirmPassword")}
          value={profileForm.confirmPassword}
          onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
        />
        <button className="btn" type="submit">
          {t("users.updateProfile")}
        </button>
        {profileMessage ? <p className="muted">{profileMessage}</p> : null}
      </form>
    </div>
  );
};
