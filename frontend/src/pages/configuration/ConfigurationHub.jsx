import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { buildSettingsHubSections } from "../../config/workspaceExperience";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import SettingsCard from "../../components/settings/SettingsCard";
import { isMetaReviewModeEnabled } from "../../config/metaReviewMode";
import { META_REVIEW_COPY } from "../../components/meta-review/metaReviewCopy";

export default function ConfigurationHub() {
  const { translate } = useLanguage();
  const { user } = useWorkspace();
  const metaReviewMode = isMetaReviewModeEnabled();

  const sections = buildSettingsHubSections(user, SETTINGS_SECTIONS).map((section) => {
    let description = translate(section.descriptionKey);

    if (metaReviewMode && section.to.endsWith("/integrations")) {
      description = META_REVIEW_COPY.integrationsHubDescription;
    }

    if (metaReviewMode && section.to.endsWith("/profile")) {
      description = META_REVIEW_COPY.profileHubDescription;
    }

    if (metaReviewMode && section.to.endsWith("/review-users")) {
      description = META_REVIEW_COPY.reviewUsersHubDescription;
    }

    return {
      ...section,
      description
    };
  });

  return (
    <div className="settings-hub-grid">
      {sections.map((section) => (
        <SettingsCard
          key={section.to}
          to={section.to}
          title={section.title}
          description={section.description}
          icon={section.icon}
        />
      ))}
    </div>
  );
}
