import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appPath } from "../config/appRoutes";
import {
  buildNavItemsForUser,
  getDefaultLandingPath,
  resolveWorkspaceType
} from "../config/workspaceExperience";
import { isStagingUi } from "../config/atlasUiEnv";
import { WorkspaceContext } from "../contexts/WorkspaceContext";
import RequireWorkspaceAccess from "../components/RequireWorkspaceAccess";
import SidebarUserFooter from "../components/layout/SidebarUserFooter";
import { useLanguage } from "../i18n/LanguageContext";
import { ensureAtlasSession, fetchCurrentUser } from "../services/atlasAuthService";
import { fetchOperationsAccess } from "../services/operationsCenterService";
import { getConversationsAttentionCount } from "../services/conversationsCenterService";
import { exitSupportMode, getSupportMode } from "../services/platformService";
import { isSuperAdminUser } from "../security/isSuperAdminUser";
import SupportModeBanner from "../components/layout/SupportModeBanner";
import "./MainLayout.css";

const NIOVEL_USER_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const TEAM_VISION_ORG_ID = "00000000-0000-4000-8000-000000000001";

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
  currentUser,
  conversationsAttentionCount = 0
}) {
  return (
    <>
      <div className="atlas-layout__sidebar-header">
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
      </div>

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
            <span>{translate(item.labelKey)}</span>
            {item.path.includes("/conversations") && conversationsAttentionCount > 0 ? (
              <span className="atlas-layout__nav-badge" aria-label={`${conversationsAttentionCount} needing attention`}>
                {conversationsAttentionCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="atlas-layout__sidebar-footer">
        {currentUser ? (
          <SidebarUserFooter
            user={currentUser}
            translate={translate}
            language={language}
            onToggleLanguage={toggleLanguage}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="atlas-layout__sidebar-foot">{translate("teamVision")}</div>
        )}
      </div>
    </>
  );
}

export default function MainLayout() {
  const { language, toggleLanguage, translate, syncFromUser } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const layoutMode = useLayoutMode();
  const [phoneNavOpen, setPhoneNavOpen] = useState(false);
  const [tabletNavCollapsed, setTabletNavCollapsed] = useState(false);
  const [operationsAllowed, setOperationsAllowed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [conversationsAttentionCount, setConversationsAttentionCount] = useState(0);
  const [supportMode, setSupportMode] = useState(null);
  const [exitingSupportMode, setExitingSupportMode] = useState(false);
  const currentUserRef = useRef(null);
  currentUserRef.current = currentUser;

  const navItems = useMemo(
    () => buildNavItemsForUser(currentUser, { operationsAllowed }),
    [currentUser, operationsAllowed]
  );

  const refreshUser = useCallback(async () => {
    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
      return user;
    } catch {
      setCurrentUser(null);
      return null;
    }
  }, []);

  const refreshSupportMode = useCallback(async (userOverride) => {
    const user = userOverride !== undefined ? userOverride : currentUserRef.current;

    if (!isSuperAdminUser(user)) {
      setSupportMode(null);
      return null;
    }

    try {
      const status = await getSupportMode();
      setSupportMode(status);
      return status;
    } catch {
      setSupportMode(null);
      return null;
    }
  }, []);

  const handleExitSupportMode = useCallback(async () => {
    setExitingSupportMode(true);

    try {
      await exitSupportMode();
      await refreshSupportMode();
      await refreshUser();
      navigate(appPath("platform/tenants"));
    } catch {
      await refreshSupportMode();
    } finally {
      setExitingSupportMode(false);
    }
  }, [navigate, refreshSupportMode, refreshUser]);

  const workspaceValue = useMemo(
    () => ({
      user: currentUser,
      operationsAllowed,
      workspaceType: resolveWorkspaceType(currentUser?.role),
      navItems,
      landingPath: currentUser ? getDefaultLandingPath(currentUser.role) : appPath("login"),
      refreshUser,
      supportMode,
      refreshSupportMode
    }),
    [currentUser, operationsAllowed, navItems, refreshUser, supportMode, refreshSupportMode]
  );

  useEffect(() => {
    ensureAtlasSession().catch(() => {});
    refreshUser().then((user) => {
      refreshSupportMode(user);
    });
  }, [location.pathname, refreshUser, refreshSupportMode]);

  useEffect(() => {
    if (currentUser) {
      syncFromUser(currentUser);
    }
  }, [currentUser, syncFromUser]);

  useEffect(() => {
    let cancelled = false;

    fetchOperationsAccess()
      .then((profile) => {
        if (!cancelled) {
          setOperationsAllowed(Boolean(profile.allowed));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperationsAllowed(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isPilotUser =
      currentUser?.id === NIOVEL_USER_ID &&
      String(currentUser?.organization_id || "") === TEAM_VISION_ORG_ID;

    if (!isPilotUser) {
      setConversationsAttentionCount(0);
      return undefined;
    }

    let cancelled = false;

    function refreshBadge() {
      getConversationsAttentionCount()
        .then((payload) => {
          if (!cancelled) {
            setConversationsAttentionCount(Number(payload.needsAttentionCount) || 0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setConversationsAttentionCount(0);
          }
        });
    }

    refreshBadge();
    const timer = window.setInterval(refreshBadge, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser, location.pathname]);

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
    <WorkspaceContext.Provider value={workspaceValue}>
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
            conversationsAttentionCount={conversationsAttentionCount}
          />
        </aside>

        <div className="atlas-layout__frame">
          <SupportModeBanner
            supportMode={supportMode}
            onExit={handleExitSupportMode}
            exiting={exitingSupportMode}
            translate={translate}
          />
          {isStagingUi() ? (
            <div className="atlas-layout__staging-banner" role="status" data-atlas-env="staging">
              STAGING
            </div>
          ) : null}
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
              <RequireWorkspaceAccess>
                <Outlet />
              </RequireWorkspaceAccess>
            </div>
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
