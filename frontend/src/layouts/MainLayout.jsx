import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { missionControlNav, operationsCenterNavItem, adminNavItem } from "../config/missionControlNav";
import { appPath } from "../config/appRoutes";
import { useLanguage } from "../i18n/LanguageContext";
import { ensureAtlasSession, fetchCurrentUser } from "../services/atlasAuthService";
import { fetchOperationsAccess } from "../services/operationsCenterService";
import UserAvatar from "../components/ui/UserAvatar";
import "../components/ui/ProfilePhotoEditor.css";
import "./MainLayout.css";

function useLayoutMode() {
  const [mode, setMode] = useState(() => getLayoutMode());

  useEffect(() => {
    const mediaPhone = window.matchMedia("(max-width: 767px)");
    const mediaTablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");

    function update() {
      setMode(getLayoutMode());
    }

    mediaPhone.addEventListener("change", update);
    mediaTablet.addEventListener("change", update);
    window.addEventListener("resize", update);

    return () => {
      mediaPhone.removeEventListener("change", update);
      mediaTablet.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return mode;
}

function getLayoutMode() {
  const width = window.innerWidth;

  if (width < 768) {
    return "phone";
  }

  if (width < 1024) {
    return "tablet";
  }

  return "desktop";
}

function SidebarNav({
  translate,
  language,
  toggleLanguage,
  onNavigate,
  showClose,
  onClose,
  showCollapse,
  onCollapse,
  navItems,
  currentUser
}) {
  return (
    <>
      <Link to="/" className="atlas-layout__public-link">
        ← Team Vision Financial
      </Link>

      <div className="atlas-layout__sidebar-head">
        <h2 className="atlas-layout__brand-title">{translate("layoutAppTitle")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {showCollapse ? (
            <button
              type="button"
              className="atlas-layout__sidebar-collapse"
              onClick={onCollapse}
              aria-label={translate("layoutCollapseMenu")}
            >
              ←
            </button>
          ) : null}
          {showClose ? (
            <button
              type="button"
              className="atlas-layout__sidebar-close"
              onClick={onClose}
              aria-label={translate("layoutCloseMenu")}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <p className="atlas-layout__brand-subtitle">{translate("teamVisionRecruiting")}</p>

      <nav className="atlas-layout__nav" aria-label={translate("layoutNavLabel")}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `atlas-layout__nav-link${isActive ? " is-active" : ""}`
            }
            onClick={onNavigate}
          >
            {translate(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      <button type="button" className="atlas-layout__language-toggle" onClick={toggleLanguage}>
        {language === "es" ? translate("switchToEnglish") : translate("switchToSpanish")}
      </button>

      {currentUser ? (
        <Link to={appPath("my-account")} className="sidebar-user-link">
          <UserAvatar
            photoUrl={currentUser.photo_url}
            name={currentUser.display_name || currentUser.first_name}
            email={currentUser.email}
            size="md"
            className="user-avatar--on-dark"
          />
          <span className="sidebar-user-link__meta">
            <span className="sidebar-user-link__name">
              {currentUser.display_name ||
                [currentUser.first_name, currentUser.last_name].filter(Boolean).join(" ") ||
                currentUser.email}
            </span>
            <span className="sidebar-user-link__email">{currentUser.email}</span>
          </span>
        </Link>
      ) : (
        <div className="atlas-layout__sidebar-foot">{translate("teamVision")}</div>
      )}
    </>
  );
}

export default function MainLayout() {
  const { language, toggleLanguage, translate } = useLanguage();
  const location = useLocation();
  const layoutMode = useLayoutMode();
  const [phoneNavOpen, setPhoneNavOpen] = useState(false);
  const [tabletNavCollapsed, setTabletNavCollapsed] = useState(false);
  const [showOperationsCenter, setShowOperationsCenter] = useState(import.meta.env.DEV);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const navItems = useMemo(() => {
    let items = [...missionControlNav];

    if (isAdministrator) {
      items = [...items, adminNavItem];
    }

    if (showOperationsCenter) {
      items = [...items, operationsCenterNavItem];
    }

    return items;
  }, [showOperationsCenter, isAdministrator]);

  useEffect(() => {
    ensureAtlasSession().catch(() => {});
    fetchCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        setIsAdministrator(user?.role === "administrator");
      })
      .catch(() => {
        setCurrentUser(null);
        setIsAdministrator(false);
      });
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    fetchOperationsAccess()
      .then((profile) => {
        if (!cancelled) {
          setShowOperationsCenter(Boolean(profile.allowed));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setShowOperationsCenter(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPhoneNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (layoutMode !== "phone") {
      setPhoneNavOpen(false);
    }

    if (layoutMode === "desktop") {
      setTabletNavCollapsed(false);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (layoutMode !== "phone" || !phoneNavOpen) {
      document.body.style.overflow = "";
      return undefined;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [layoutMode, phoneNavOpen]);

  const closePhoneNav = useCallback(() => {
    setPhoneNavOpen(false);
  }, []);

  const openNav = useCallback(() => {
    if (layoutMode === "phone") {
      setPhoneNavOpen(true);
      return;
    }

    if (layoutMode === "tablet") {
      setTabletNavCollapsed(false);
    }
  }, [layoutMode]);

  const sidebarClassName = [
    "atlas-layout__sidebar",
    phoneNavOpen ? "is-open" : "",
    tabletNavCollapsed ? "is-collapsed" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const showMobileHeader = layoutMode === "phone" || (layoutMode === "tablet" && tabletNavCollapsed);
  const showSidebarClose = layoutMode === "phone" && phoneNavOpen;
  const showSidebarCollapse = layoutMode === "tablet" && !tabletNavCollapsed;

  const collapseTabletNav = useCallback(() => {
    setTabletNavCollapsed(true);
  }, []);

  return (
    <div className="atlas-layout">
      {layoutMode === "phone" && phoneNavOpen ? (
        <button
          type="button"
          className="atlas-layout__backdrop"
          aria-label={translate("layoutCloseMenu")}
          onClick={closePhoneNav}
        />
      ) : null}

      <aside className={sidebarClassName}>
        <SidebarNav
          translate={translate}
          language={language}
          toggleLanguage={toggleLanguage}
          onNavigate={layoutMode === "phone" ? closePhoneNav : undefined}
          showClose={showSidebarClose}
          onClose={closePhoneNav}
          showCollapse={showSidebarCollapse}
          onCollapse={collapseTabletNav}
          navItems={navItems}
          currentUser={currentUser}
        />
      </aside>

      <div className="atlas-layout__frame">
        <header className={`atlas-layout__header${showMobileHeader ? " is-visible" : ""}`}>
          <button
            type="button"
            className="atlas-layout__menu-button"
            aria-label={translate("layoutOpenMenu")}
            aria-expanded={layoutMode === "phone" ? phoneNavOpen : !tabletNavCollapsed}
            onClick={openNav}
          >
            ☰
          </button>
          <span className="atlas-layout__header-title">{translate("layoutAppTitle")}</span>
        </header>

        <main className="atlas-layout__main">
          <div className="atlas-layout__content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
