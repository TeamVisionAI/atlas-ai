import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { buildSettingsHubSections } from "../../config/workspaceExperience";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import SettingsCard from "../../components/settings/SettingsCard";

export default function ConfigurationHub() {
  const { translate } = useLanguage();
  const { user } = useWorkspace();

  const sections = buildSettingsHubSections(user, SETTINGS_SECTIONS);

  return (
    <div className="settings-hub-grid">
      {sections.map((section) => (
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
