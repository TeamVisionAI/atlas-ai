import { Suspense } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import { SETTINGS_SECTIONS, SETTINGS_TITLE } from "../../config/settingsProductNames";
import SettingsIcon from "../../components/icons/SettingsIcons";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import "./Configuration.css";

const NAV_ITEMS = [
  { to: appPath("settings/profile"), label: SETTINGS_SECTIONS.profile, icon: "profile", end: false },
  {
    to: appPath("settings/organization"),
    label: SETTINGS_SECTIONS.organization,
    icon: "organization",
    end: false
  },
  { to: appPath("settings/whatsapp"), label: SETTINGS_SECTIONS.whatsapp, icon: "whatsapp", end: false },
  {
    to: appPath("settings/scheduling"),
    label: SETTINGS_SECTIONS.scheduling,
    icon: "scheduling",
    end: false
  },
  {
    to: appPath("settings/appointments"),
    label: SETTINGS_SECTIONS.appointments,
    icon: "scheduling",
    end: false
  }
];

export default function ConfigurationLayout() {
  const { translate } = useLanguage();
  const isHubIndex = Boolean(useMatch({ path: appPath("settings"), end: true }));

  return (
    <div className="configuration-page">
      <header className="configuration-header">
        <h1 className="configuration-header__title">{SETTINGS_TITLE}</h1>
        <p className="configuration-header__subtitle">{translate("configurationSubtitle")}</p>
      </header>

      {!isHubIndex ? (
        <nav className="configuration-nav" aria-label={SETTINGS_TITLE}>
          {NAV_ITEMS.map((item) => (
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
