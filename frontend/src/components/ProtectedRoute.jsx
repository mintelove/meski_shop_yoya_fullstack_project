import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

export const ProtectedRoute = ({ roles, children }) => {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) return <div className="center-screen">{t("common.loading")}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
};
