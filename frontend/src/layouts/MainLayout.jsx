import { NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { missionControlNav } from "../config/missionControlNav";
import { useLanguage } from "../i18n/LanguageContext";
import { bootstrapAtlasSession } from "../services/atlasAuthService";

export default function MainLayout() {
  const { language, toggleLanguage, t } = useLanguage();

  useEffect(() => {
    bootstrapAtlasSession().catch(() => {
      // Session bootstrap is optional until auth is configured.
    });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#F3F5F9"
      }}
    >
      <aside
        style={{
          width: 250,
          background: "#172554",
          color: "white",
          padding: 25,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <h2 style={{ marginTop: 0 }}>Atlas Mission Control</h2>

        <p
          style={{
            color: "#94A3B8",
            marginBottom: 32,
            marginTop: 0
          }}
        >
          Team Vision Recruiting
        </p>

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {missionControlNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              style={({ isActive }) => ({
                padding: "12px 14px",
                borderRadius: 8,
                background: isActive ? "#1E3A8A" : "transparent",
                color: "white",
                textDecoration: "none",
                fontWeight: isActive ? 600 : 400
              })}
            >
              {item.path === "/quick-capture" ? t.navQuickCapture : item.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={toggleLanguage}
          style={{
            marginTop: 16,
            alignSelf: "flex-start",
            background: "transparent",
            border: "1px solid #334155",
            color: "#CBD5E1",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: 13
          }}
        >
          {language === "es" ? "English UI" : "Español UI"}
        </button>

        <div
          style={{
            marginTop: "auto",
            color: "#94A3B8",
            fontSize: 14,
            paddingTop: 40
          }}
        >
          Team Vision
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0
        }}
      >
        <main
          style={{
            padding: "30px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden"
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
