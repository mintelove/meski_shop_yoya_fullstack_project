import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

const linkClass = (active) => (active ? "sidebar-link active" : "sidebar-link");

export const Layout = () => {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const isAdmin = user?.role === "admin";
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>{t("app.title")}</h2>
        <p className="muted">
          {user?.name} ({user?.role === "admin" ? t("common.admin") : t("common.salesman")})
        </p>

        <nav className="sidebar-nav">
          <Link to="/" className={linkClass(location.pathname === "/")}>
            {t("nav.dashboard")}
          </Link>
          <Link to="/products" className={linkClass(location.pathname === "/products")}>
            {t("nav.products")}
          </Link>
          <Link to="/sales" className={linkClass(location.pathname === "/sales")}>
            {t("nav.sales")}
          </Link>
          {isAdmin && (
            <Link to="/users" className={linkClass(location.pathname === "/users")}>
              {t("nav.users")}
            </Link>
          )}
          {isAdmin && (
            <Link to="/settings" className={linkClass(location.pathname === "/settings")}>
              {t("nav.settings")}
            </Link>
          )}
        </nav>
        <button className="btn secondary" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? t("common.darkMode") : t("common.lightMode")}
        </button>
        <button onClick={logout} className="btn btn-danger">
          {t("common.logout")}
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
};
