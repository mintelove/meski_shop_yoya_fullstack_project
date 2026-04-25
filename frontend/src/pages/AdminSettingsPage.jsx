import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";

const initialForm = {
  password: "",
  confirmation: ""
};

export const AdminSettingsPage = () => {
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canSubmit = form.password.trim().length >= 6 && form.confirmation === "RESET" && !submitting;

  const closeModal = (force = false) => {
    if (submitting && !force) return;
    setShowModal(false);
    setForm(initialForm);
    setError("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      await api.post("/admin/reset-database", {
        password: form.password,
        confirmation: form.confirmation
      });
      setMessage(t("settings.resetSuccess"));
      closeModal(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || t("settings.resetFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack">
      <h2>{t("settings.title")}</h2>
      <section className="card danger-zone-card">
        <div className="row-between">
          <div>
            <h3 className="danger-zone-title">{t("settings.dangerZone")}</h3>
            <p className="error danger-zone-warning">{t("settings.warningText")}</p>
          </div>
          <button className="btn btn-danger" onClick={() => setShowModal(true)}>
            {t("settings.resetDatabase")}
          </button>
        </div>
        {message ? <p className="danger-zone-success">{message}</p> : null}
      </section>

      {showModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("settings.resetDatabase")}>
          <form className="card modal-card stack" onSubmit={onSubmit}>
            <h3>{t("settings.confirmReset")}</h3>
            <p className="error">{t("settings.warningText")}</p>

            <label>{t("settings.passwordLabel")}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={t("settings.passwordPlaceholder")}
              required
              minLength={6}
            />

            <label>{t("settings.typeResetLabel")}</label>
            <input
              value={form.confirmation}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmation: event.target.value.toUpperCase() }))}
              placeholder="RESET"
              required
            />

            {error ? <p className="error">{error}</p> : null}

            <div className="row-between">
              <button type="button" className="btn secondary" onClick={closeModal} disabled={submitting}>
                {t("users.cancel")}
              </button>
              <button type="submit" className="btn btn-danger" disabled={!canSubmit}>
                {submitting ? (
                  <span className="login-loading-wrap">
                    <span className="login-spinner" />
                    {t("settings.resetting")}
                  </span>
                ) : (
                  t("settings.confirmAndReset")
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
