import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

const rememberedEmailKey = "rememberedEmail";

const LogoIcon = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="40" height="40" rx="12" stroke="url(#logo-grad)" strokeWidth="2.5" fill="rgba(99,102,241,0.08)" />
    <path d="M14 28V16l8 6 8-6v12" stroke="url(#logo-grad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <defs>
      <linearGradient id="logo-grad" x1="0" y1="0" x2="44" y2="44">
        <stop stopColor="#818cf8" />
        <stop offset="1" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
  </svg>
);

const InputIcon = ({ path }) => (
  <svg className="lp-input-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Stagger container + children variants */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } }
};

const childVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } }
};

const shakeVariants = {
  shake: {
    x: [0, -12, 10, -8, 6, -3, 0],
    transition: { duration: 0.5, ease: "easeInOut" }
  }
};

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
  const [shakeKey, setShakeKey] = useState(0);
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
      const msg = !err.response
        ? t("auth.serverUnavailable")
        : err.response?.data?.message || t("auth.loginFailed");
      setError(msg);
      setShakeKey((prev) => prev + 1); // trigger shake
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-screen">
      {/* Animated background blobs */}
      <div className="lp-blob lp-blob--1" />
      <div className="lp-blob lp-blob--2" />
      <div className="lp-blob lp-blob--3" />
      <div className="lp-blob lp-blob--4" />

      {/* Floating grid lines overlay */}
      <div className="lp-grid-overlay" />

      <motion.div
        key={shakeKey}
        className="lp-pod"
        variants={shakeKey > 0 ? shakeVariants : {}}
        animate={shakeKey > 0 ? "shake" : undefined}
      >
        <motion.form
          onSubmit={onSubmit}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="lp-form"
        >
          {/* Logo */}
          <motion.div className="lp-logo-row" variants={childVariants}>
            <LogoIcon />
            <div>
              <h1 className="lp-title">{t("app.title")}</h1>
              <p className="lp-subtitle">{t("auth.hint")}</p>
            </div>
          </motion.div>

          {/* Divider */}
          <motion.div className="lp-divider" variants={childVariants} />

          {/* Email */}
          <motion.div className="lp-field" variants={childVariants}>
            <label className="lp-label">{t("auth.email")}</label>
            <div className={`lp-input-wrap ${touched.email && fieldErrors.email ? "lp-input-wrap--error" : ""}`}>
              <InputIcon path="M4 7l8 6 8-6M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z" />
              <input
                type="email"
                placeholder={t("auth.emailOrUsername")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                autoComplete="username"
              />
            </div>
            <AnimatePresence>
              {touched.email && fieldErrors.email ? (
                <motion.p
                  className="lp-field-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {fieldErrors.email}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </motion.div>

          {/* Password */}
          <motion.div className="lp-field" variants={childVariants}>
            <label className="lp-label">{t("auth.password")}</label>
            <div className={`lp-input-wrap ${touched.password && fieldErrors.password ? "lp-input-wrap--error" : ""}`}>
              <InputIcon path="M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="lp-eye-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
              >
                {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              </button>
            </div>
            <AnimatePresence>
              {touched.password && fieldErrors.password ? (
                <motion.p
                  className="lp-field-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {fieldErrors.password}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </motion.div>

          {/* Options row */}
          <motion.div className="lp-options" variants={childVariants}>
            <label className="lp-check-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>{t("auth.rememberMe")}</span>
            </label>
            <button type="button" className="lp-forgot-btn">
              {t("auth.forgotPassword")}
            </button>
          </motion.div>

          {/* Error / Success */}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key="err"
                className="lp-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
          {success ? <p className="lp-success">{success}</p> : null}

          {/* Submit button */}
          <motion.button
            className="lp-submit"
            type="submit"
            disabled={loading}
            variants={childVariants}
            whileHover={loading ? {} : { scale: 1.025, boxShadow: "0 0 32px rgba(99,102,241,0.45), 0 0 64px rgba(6,182,212,0.2)" }}
            whileTap={loading ? {} : { scale: 0.975 }}
          >
            {loading ? (
              <span className="lp-loading">
                <span className="lp-spinner" />
                {t("auth.signingIn")}
              </span>
            ) : (
              t("auth.login")
            )}
          </motion.button>

          {/* Role hint */}
          <motion.p className="lp-role-hint" variants={childVariants}>
            {t("auth.roleHint")}
          </motion.p>
        </motion.form>
      </motion.div>
    </div>
  );
};
