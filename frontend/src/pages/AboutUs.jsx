import { useI18n } from "../context/I18nContext";
import logo from "../picture/logo.jpg";

export const AboutUs = () => {
  const { t } = useI18n();

  return (
    <div className="about-page">
      {/* Hero Section */}
      <div className="about-hero">
        <div className="about-logo-wrap">
          <img src={logo} alt="MaM App Studio" className="about-logo" />
        </div>
        <h1 className="about-company-name">{t("about.companyName")}</h1>
        <p className="about-tagline">{t("about.tagline")}</p>
      </div>

      {/* Decorative Divider */}
      <div className="about-divider">
        <span className="about-divider-icon">✦</span>
      </div>

      {/* Info Cards Grid */}
      <div className="about-cards-grid">
        {/* Email Card */}
        <div className="about-card">
          <div className="about-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
          </div>
          <h3 className="about-card-title">{t("about.email")}</h3>
          <a href="mailto:mintesnotmilkias0@gmail.com" className="about-card-link">
            mintesnotmilkias0@gmail.com
          </a>
          <a href="mailto:mammy2012m@gmail.com" className="about-card-link">
            mammy2012m@gmail.com
          </a>
        </div>

        {/* Phone Card */}
        <div className="about-card">
          <div className="about-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <h3 className="about-card-title">{t("about.phone")}</h3>
          <a href="tel:+251916733489" className="about-card-link">
            +251 916 733 489
          </a>
        </div>

        {/* Developer Card */}
        <div className="about-card">
          <div className="about-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </div>
          <h3 className="about-card-title">{t("about.developer")}</h3>
          <p className="about-card-text">{t("about.developerDesc")}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="about-footer">
        <p className="about-footer-text">
          © {new Date().getFullYear()} MaM App Studio. {t("about.rights")}
        </p>
      </div>
    </div>
  );
};
