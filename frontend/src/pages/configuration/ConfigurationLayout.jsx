import { Suspense } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { appPath } from "../../config/appRoutes";
import { buildSettingsNavItems } from "../../config/workspaceExperience";
import { SETTINGS_SECTIONS, SETTINGS_TITLE } from "../../config/settingsProductNames";
import SettingsIcon from "../../components/icons/SettingsIcons";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import "./Configuration.css";

export default function ConfigurationLayout() {
  const { translate } = useLanguage();
  const { user } = useWorkspace();
  const isHubIndex = Boolean(useMatch({ path: appPath("settings"), end: true }));
  const navItems = buildSettingsNavItems(user, SETTINGS_SECTIONS);

  return (
    <div className="configuration-page">
      <header className="configuration-header">
        <h1 className="configuration-header__title">{SETTINGS_TITLE}</h1>
        <p className="configuration-header__subtitle">{translate("configurationSubtitle")}</p>
      </header>

      {!isHubIndex && navItems.length > 0 ? (
        <nav className="configuration-nav" aria-label={SETTINGS_TITLE}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `configuration-nav__link${isActive ? " configuration-nav__link--active" : ""}`
              }
            >
              <span className="configuration-nav__icon">
                <SettingsIcon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}

      <Suspense fallback={<ConfigurationLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
