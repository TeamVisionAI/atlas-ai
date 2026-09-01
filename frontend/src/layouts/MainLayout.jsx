import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appPath } from "../config/appRoutes";
import {
  buildNavItemsForUser,
  getDefaultLandingPath,
  resolveWorkspaceType
} from "../config/workspaceExperience";
import {
  buildSidebarNavModel,
  expandActiveSidebarGroup,
  isGroupActive,
  readSidebarGroupState,
  toggleSidebarGroupState,
  writeSidebarGroupState
} from "../engines/sidebarNavigation";
import { isStagingUi } from "../config/atlasUiEnv";
import { WorkspaceContext } from "../contexts/WorkspaceContext";
import RequireWorkspaceAccess from "../components/RequireWorkspaceAccess";
import SidebarUserFooter from "../components/layout/SidebarUserFooter";
import { useLanguage } from "../i18n/LanguageContext";
import { ensureAtlasSession, fetchCurrentUser } from "../services/atlasAuthService";
import { fetchOperationsAccess } from "../services/operationsCenterService";
import {
  clearConversationsCaches,
  getConversationsAttentionCount,
  getConversationsCenterAccess
} from "../services/conversationsCenterService";
import { fetchOrganizationBranding } from "../services/organizationBrandingService";
import { getKnowledgeHubAccess } from "../services/knowledgeService";
import {
  knowledgeAccessAllowsNav,
  resolveKnowledgeAccessStateFromPayload
} from "../engines/knowledgeHubAccess";
import { exitSupportMode, getSupportMode } from "../services/platformService";
import { isSuperAdminUser } from "../security/isSuperAdminUser";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import { resolveAuthenticatedShellBrand } from "../engines/authenticatedShellBrand";
import NotificationBell from "../components/layout/NotificationBell";
import {
  conversationsAccessAllowsNav,
  resolveConversationsAccessStateFromPayload
} from "../engines/conversationsCenterAccess";
import SupportModeBanner from "../components/layout/SupportModeBanner";
import UnsupportedWhatsAppLeadReviewBanner from "../components/layout/UnsupportedWhatsAppLeadReviewBanner";
import UrgentAppointmentHandoffBanner from "../components/layout/UrgentAppointmentHandoffBanner";
import {
  confirmUnsupportedWhatsAppInboundReview,
  dismissUnsupportedWhatsAppInboundReview,
  fetchPendingUnsupportedWhatsAppInboundReviews
} from "../services/unsupportedWhatsAppInboundReviewService";
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

function SidebarNavLink({ item, translate, conversationsAttentionCount, onNavigate, child }) {
  return (
    <NavLink
      to={item.path}
      end={item.end}
      className={({ isActive }) =>
        `atlas-layout__nav-link${child ? " atlas-layout__nav-link--child" : ""}${isActive ? " is-active" : ""}`
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
  );
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
  conversationsAttentionCount = 0,
  organizationName = "",
  brandTitle = ""
}) {
  const location = useLocation();
  const title = String(brandTitle || "").trim() || translate("layoutAppTitle");
  const brandName = String(organizationName || "").trim() || translate("layoutBrandSubtitleFallback");
  const navModel = useMemo(() => buildSidebarNavModel(navItems), [navItems]);
  const [groupOpen, setGroupOpen] = useState(() =>
    readSidebarGroupState(typeof window === "undefined" ? null : window.localStorage)
  );

  useEffect(() => {
    setGroupOpen((current) => {
      const next = expandActiveSidebarGroup(current, location.pathname, navModel);
      if (JSON.stringify(next) === JSON.stringify(current)) {
        return current;
      }
      writeSidebarGroupState(next, typeof window === "undefined" ? null : window.localStorage);
      return next;
    });
  }, [location.pathname, navModel]);

  const handleToggleGroup = useCallback((groupId) => {
    setGroupOpen((current) => {
      const next = toggleSidebarGroupState(current, groupId);
      writeSidebarGroupState(next, typeof window === "undefined" ? null : window.localStorage);
      return next;
    });
  }, []);

  return (
    <>
      <div className="atlas-layout__sidebar-header">
        <Link to="/" className="atlas-layout__public-link">
          {translate("layoutPublicHomeLink")}
        </Link>

        <div className="atlas-layout__sidebar-head">
          <h2 className="atlas-layout__brand-title">{title}</h2>
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
            <NotificationBell enabled={Boolean(currentUser)} />
          </div>
        </div>

        <p className="atlas-layout__brand-subtitle">{brandName}</p>
      </div>

      <nav className="atlas-layout__nav" aria-label={translate("layoutNavLabel")}>
        {navModel.topLevel.map((item) => (
          <SidebarNavLink
            key={item.path}
            item={item}
            translate={translate}
            conversationsAttentionCount={conversationsAttentionCount}
            onNavigate={onNavigate}
          />
        ))}

        {navModel.groups.map((group) => {
          const expanded = groupOpen[group.id] !== false;
          const groupHasActive = isGroupActive(group, location.pathname);
          const panelId = `atlas-nav-group-${group.id}`;
          return (
            <div
              key={group.id}
              className={`atlas-layout__nav-group${groupHasActive ? " is-active" : ""}`}
            >
              <button
                type="button"
                className={`atlas-layout__nav-group-toggle${groupHasActive ? " is-active" : ""}`}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => handleToggleGroup(group.id)}
              >
                <span>{translate(group.labelKey)}</span>
                <span className={`atlas-layout__nav-group-chevron${expanded ? " is-open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              <div
                id={panelId}
                className={`atlas-layout__nav-group-panel${expanded ? " is-open" : ""}`}
              >
                <div className="atlas-layout__nav-group-panel-inner">
                  {group.children.map((item) => (
                    <SidebarNavLink
                      key={item.path}
                      item={item}
                      child
                      translate={translate}
                      conversationsAttentionCount={conversationsAttentionCount}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {navModel.trailing.length ? (
          <div className="atlas-layout__nav-trailing">
            {navModel.trailing.map((item) => (
              <SidebarNavLink
                key={item.path}
                item={item}
                translate={translate}
                conversationsAttentionCount={conversationsAttentionCount}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
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
          <div className="atlas-layout__sidebar-foot">{translate("layoutBrandSubtitleFallback")}</div>
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
  const [conversationsCenterAllowed, setConversationsCenterAllowed] = useState(null);
  const [knowledgeHubAllowed, setKnowledgeHubAllowed] = useState(null);
  const [supportMode, setSupportMode] = useState(null);
  const [organizationBranding, setOrganizationBranding] = useState(null);
  const [exitingSupportMode, setExitingSupportMode] = useState(false);
  const [unsupportedWhatsAppReviews, setUnsupportedWhatsAppReviews] = useState([]);
  const [unsupportedReviewBusyId, setUnsupportedReviewBusyId] = useState(null);
  const lastUnsupportedReviewSignalRef = useRef("");
  const currentUserRef = useRef(null);
  currentUserRef.current = currentUser;

  const navItems = useMemo(
    () =>
      buildNavItemsForUser(currentUser, {
        operationsAllowed,
        conversationsCenterAllowed,
        knowledgeHubAllowed
      }),
    [currentUser, operationsAllowed, conversationsCenterAllowed, knowledgeHubAllowed]
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
      setSupportMode(null);
      await exitSupportMode();
      clearConversationsCaches();
      setOrganizationBranding(null);
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
    if (!currentUser) {
      setConversationsCenterAllowed(null);
      setConversationsAttentionCount(0);
      return undefined;
    }

    let cancelled = false;

    getConversationsCenterAccess()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const state = resolveConversationsAccessStateFromPayload(payload);
        setConversationsCenterAllowed(conversationsAccessAllowsNav(state));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error?.status === 403) {
          setConversationsCenterAllowed(false);
          return;
        }
        setConversationsCenterAllowed(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, supportMode?.active, supportMode?.organizationId, location.pathname]);

  const shellBrand = useMemo(
    () =>
      resolveAuthenticatedShellBrand({
        user: currentUser,
        supportMode,
        branding: organizationBranding,
        atlasLabel: translate("layoutBrandSubtitleFallback")
      }),
    [currentUser, supportMode, organizationBranding, translate]
  );
  const shellBrandTitle =
    shellBrand.controlPlane || !shellBrand.name
      ? translate("layoutAppTitle")
      : shellBrand.name;
  const shellBrandSubtitle =
    shellBrand.name || translate("layoutBrandSubtitleFallback");

  useEffect(() => {
    if (!currentUser || isGlobalSuperAdminControlPlane(currentUser, supportMode)) {
      setOrganizationBranding(null);
      return undefined;
    }

    let cancelled = false;
    fetchOrganizationBranding()
      .then((branding) => {
        if (!cancelled) {
          setOrganizationBranding(branding?.controlPlane ? null : branding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrganizationBranding(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, supportMode?.active, supportMode?.organizationId]);

  useEffect(() => {
    if (!currentUser) {
      setKnowledgeHubAllowed(null);
      return undefined;
    }

    let cancelled = false;

    getKnowledgeHubAccess()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const state = resolveKnowledgeAccessStateFromPayload(payload);
        setKnowledgeHubAllowed(knowledgeAccessAllowsNav(state));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error?.payload?.status === 403 || error?.status === 403) {
          setKnowledgeHubAllowed(false);
          return;
        }
        setKnowledgeHubAllowed(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, supportMode?.active, supportMode?.organizationId, location.pathname]);

  useEffect(() => {
    if (conversationsCenterAllowed !== true) {
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
  }, [conversationsCenterAllowed, currentUser, location.pathname]);

  useEffect(() => {
    if (!currentUser) {
      setUnsupportedWhatsAppReviews([]);
      lastUnsupportedReviewSignalRef.current = "";
      return undefined;
    }

    let cancelled = false;

    function playAttentionTone() {
      try {
        const context = new window.AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.value = 0.04;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.18);
        oscillator.onended = () => {
          context.close().catch(() => {});
        };
      } catch {
        /* optional tone only */
      }
    }

    function refreshUnsupportedReviews() {
      fetchPendingUnsupportedWhatsAppInboundReviews()
        .then((payload) => {
          if (cancelled) {
            return;
          }
          const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
          const signal = reviews.map((review) => review.id).join("|");
          if (
            signal &&
            lastUnsupportedReviewSignalRef.current &&
            signal !== lastUnsupportedReviewSignalRef.current
          ) {
            playAttentionTone();
          }
          lastUnsupportedReviewSignalRef.current = signal;
          setUnsupportedWhatsAppReviews(reviews);
        })
        .catch(() => {
          if (!cancelled) {
            setUnsupportedWhatsAppReviews([]);
          }
        });
    }

    refreshUnsupportedReviews();
    const timer = window.setInterval(refreshUnsupportedReviews, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser, location.pathname, supportMode?.active, supportMode?.organizationId]);

  const handleDismissUnsupportedReview = useCallback(async (review) => {
    if (!review?.id) {
      return;
    }

    setUnsupportedReviewBusyId(review.id);
    try {
      await dismissUnsupportedWhatsAppInboundReview(review.id);
      setUnsupportedWhatsAppReviews((current) => current.filter((row) => row.id !== review.id));
    } finally {
      setUnsupportedReviewBusyId(null);
    }
  }, []);

  const handleConfirmUnsupportedReview = useCallback(
    async (review) => {
      if (!review?.id) {
        return;
      }

      const campaignCode = window.prompt(translate("unsupportedWhatsAppLeadReviewConfirmPrompt"), "");
      if (campaignCode === null) {
        return;
      }

      setUnsupportedReviewBusyId(review.id);
      try {
        await confirmUnsupportedWhatsAppInboundReview(review.id, campaignCode.trim() || null);
        setUnsupportedWhatsAppReviews((current) => current.filter((row) => row.id !== review.id));
      } finally {
        setUnsupportedReviewBusyId(null);
      }
    },
    [translate]
  );

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
            organizationName={shellBrandSubtitle}
            brandTitle={shellBrandTitle}
          />
        </aside>

        <div className="atlas-layout__frame">
          <SupportModeBanner
            supportMode={supportMode}
            onExit={handleExitSupportMode}
            exiting={exitingSupportMode}
            translate={translate}
          />
          <UnsupportedWhatsAppLeadReviewBanner
            reviews={unsupportedWhatsAppReviews}
            translate={translate}
            language={language}
            onDismiss={handleDismissUnsupportedReview}
            onConfirm={handleConfirmUnsupportedReview}
            busyReviewId={unsupportedReviewBusyId}
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
            <span className="atlas-layout__header-title">{shellBrandTitle}</span>
            <NotificationBell enabled={Boolean(currentUser)} />
          </header>

          <main className="atlas-layout__main">
            <div className="atlas-layout__content">
              <UrgentAppointmentHandoffBanner enabled={Boolean(currentUser)} />
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
