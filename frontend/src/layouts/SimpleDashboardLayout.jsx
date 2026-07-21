import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../components/onboarding/Onboarding.css";
import "../layouts/MainLayout.css";

export default function SimpleDashboardLayout() {
  const { user, organization, logout } = useAuth();

  return (
    <div className="atlas-layout">
      <div className="atlas-layout__frame" style={{ marginLeft: 0 }}>
        <header className="atlas-layout__header is-visible">
          <span className="atlas-layout__header-title">Atlas</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "#64748b", fontSize: "0.875rem" }}>
              {organization?.name || user?.displayName}
            </span>
            <button type="button" className="onboarding-button onboarding-button--ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="atlas-layout__main">
          <div className="atlas-layout__content">
            <Outlet />
          </div>
        </main>

        <footer style={{ padding: "16px 24px", color: "#94a3b8", fontSize: "0.875rem" }}>
          <Link to="/" style={{ color: "inherit" }}>
            Team Vision Financial
          </Link>
        </footer>
      </div>
    </div>
  );
}
