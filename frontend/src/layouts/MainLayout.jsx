import { NavLink, Outlet } from "react-router-dom";
import { missionControlNav } from "../config/missionControlNav";

export default function MainLayout() {
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
              {item.label}
            </NavLink>
          ))}
        </nav>

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
