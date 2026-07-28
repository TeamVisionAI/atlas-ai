import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import SettingsCard from "../../components/settings/SettingsCard";

const HUB_SECTIONS = [
  {
    to: appPath("settings/profile"),
    title: SETTINGS_SECTIONS.profile,
    descriptionKey: "configurationHubProfileDescription",
    icon: "profile"
  },
  {
    to: appPath("settings/organization"),
    title: SETTINGS_SECTIONS.organization,
    descriptionKey: "configurationHubOrganizationDescription",
    icon: "organization"
  },
  {
    to: appPath("settings/scheduling"),
    title: SETTINGS_SECTIONS.scheduling,
    descriptionKey: "configurationHubSchedulingDescription",
    icon: "scheduling"
  },
  {
    to: appPath("settings/appointments"),
    title: SETTINGS_SECTIONS.appointments,
    descriptionKey: "configurationHubAppointmentsDescription",
    icon: "scheduling"
  }
];

export default function ConfigurationHub() {
  const { translate } = useLanguage();

  return (
    <div className="settings-hub-grid">
      {HUB_SECTIONS.map((section) => (
        <SettingsCard
          key={section.to}
          to={section.to}
          title={section.title}
          description={translate(section.descriptionKey)}
          icon={section.icon}
        />
      ))}
    </div>
  );
}
