import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import UserAvatar from "../ui/UserAvatar";
import { appPath } from "../../config/appRoutes";
import { logoutAtlasSession } from "../../services/atlasAuthService";
import {
  getDisplayTitleLabelKey,
  getSettingsPathForUser,
  getWorkspaceLabelKey,
  resolveWorkspaceType
} from "../../config/workspaceExperience";
import "./SidebarUserFooter.css";

export default function SidebarUserFooter({
  user,
  translate,
  language,
  onToggleLanguage,
  onNavigate
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);

  const displayName =
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.email;

  const workspaceType = resolveWorkspaceType(user.role);
  const roleLabelKey = getDisplayTitleLabelKey(user);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logoutAtlasSession();
    navigate(appPath("login"), { replace: true });
  }

  function closeMenu() {
    setMenuOpen(false);
    onNavigate?.();
  }

  function handleToggleLanguage() {
    onToggleLanguage();
    closeMenu();
  }

  return (
    <div className="sidebar-user-footer" ref={containerRef}>
      <button
        type="button"
        className="sidebar-user-footer__trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <UserAvatar
          photoUrl={user.photo_url}
          name={displayName}
          email={user.email}
          size="sm"
          className="user-avatar--on-dark"
        />
        <span className="sidebar-user-footer__meta">
          <span className="sidebar-user-footer__name">{displayName}</span>
          {user.rep_id ? (
            <span className="sidebar-user-footer__rep-id">
              {translate("sidebarRepId")}: {user.rep_id}
            </span>
          ) : null}
          <span className="sidebar-user-footer__role">{translate(roleLabelKey)}</span>
        </span>
        <span className="sidebar-user-footer__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {menuOpen ? (
        <div className="sidebar-user-footer__menu" role="menu">
          <div className="sidebar-user-footer__menu-header">
            <span className="sidebar-user-footer__menu-email">{user.email}</span>
            <span className="sidebar-user-footer__menu-workspace">
              {translate("workspaceLabel")}: {translate(getWorkspaceLabelKey(workspaceType))}
            </span>
          </div>

          <Link
            to={appPath("my-account")}
            className="sidebar-user-footer__menu-item"
            role="menuitem"
            onClick={closeMenu}
          >
            {translate("navMyAccount")}
          </Link>
          <Link
            to={getSettingsPathForUser(user)}
            className="sidebar-user-footer__menu-item"
            role="menuitem"
            onClick={closeMenu}
          >
            {translate("navSettings")}
          </Link>
          <button
            type="button"
            className="sidebar-user-footer__menu-item"
            role="menuitem"
            onClick={handleToggleLanguage}
          >
            {translate("sidebarLanguage")}:{" "}
            {language === "es" ? translate("switchToEnglish") : translate("switchToSpanish")}
          </button>
          <button
            type="button"
            className="sidebar-user-footer__menu-item sidebar-user-footer__menu-item--danger"
            role="menuitem"
            onClick={handleLogout}
          >
            {translate("sidebarLogout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
