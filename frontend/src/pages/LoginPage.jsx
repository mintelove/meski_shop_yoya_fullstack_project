import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

const rememberedEmailKey = "rememberedEmail";

const Icon = ({ path }) => (
  <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InputField = ({ iconPath, error, ...props }) => (
  <div className={`login-input-wrap ${error ? "has-error" : ""}`}>
    <Icon path={iconPath} />
    <input {...props} />
  </div>
);

export const LoginPage = () => {
  const rememberedEmail = localStorage.getItem(rememberedEmailKey) || "";
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedEmail));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const fieldErrors = useMemo(() => {
    const nextErrors = {};
    if (!email.trim()) {
      nextErrors.email = t("auth.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = t("auth.emailInvalid");
    }
    if (!password.trim()) {
      nextErrors.password = t("auth.passwordRequired");
    } else if (password.length < 6) {
      nextErrors.password = t("auth.passwordMin");
    }
    return nextErrors;
  }, [email, password, t]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setTouched({ email: true, password: true });
    if (Object.keys(fieldErrors).length > 0 || loading) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      if (rememberMe) {
        localStorage.setItem(rememberedEmailKey, email.trim());
      } else {
        localStorage.removeItem(rememberedEmailKey);
      }
      setSuccess(t("auth.loginSuccess"));
      navigate("/");
    } catch (err) {
      if (!err.response) {
        setError(t("auth.serverUnavailable"));
      } else {
        setError(err.response?.data?.message || t("auth.loginFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-screen login-page">
      <form className="card login-card" onSubmit={onSubmit}>
        <h2>{t("auth.signIn")}</h2>
        <p className="muted">{t("auth.hint")}</p>
        <p className="muted login-role-hint">{t("auth.roleHint")}</p>

        <div className="login-field">
          <InputField
            iconPath="M4 7l8 6 8-6M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z"
            type="email"
            placeholder={t("auth.emailOrUsername")}
            value={email}
            error={touched.email ? fieldErrors.email : ""}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            autoComplete="username"
          />
          {touched.email && fieldErrors.email ? <p className="error login-inline-error">{fieldErrors.email}</p> : null}
        </div>

        <div className="login-field">
          <div className={`login-input-wrap ${touched.password && fieldErrors.password ? "has-error" : ""}`}>
            <Icon path="M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              autoComplete="current-password"
            />
            <button type="button" className="login-toggle-btn" onClick={() => setShowPassword((prev) => !prev)}>
              {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            </button>
          </div>
          {touched.password && fieldErrors.password ? <p className="error login-inline-error">{fieldErrors.password}</p> : null}
        </div>

        <div className="login-options">
          <label className="login-checkbox">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            <span>{t("auth.rememberMe")}</span>
          </label>
          <button type="button" className="link-btn">
            {t("auth.forgotPassword")}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="login-success">{success}</p> : null}

        <button className="btn login-submit-btn" type="submit" disabled={loading}>
          {loading ? (
            <span className="login-loading-wrap">
              <span className="login-spinner" />
              {t("auth.signingIn")}
            </span>
          ) : (
            t("auth.login")
          )}
        </button>
      </form>
    </div>
  );
};
