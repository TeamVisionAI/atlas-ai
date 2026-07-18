import { useLanguage } from "../../i18n/LanguageContext";
import { buildActivityFeedPlaceholderSummary } from "../../engines/prospectWorkspaceViewModel";

export default function ActivityFeedPlaceholder() {
  const { translate } = useLanguage();
  const summary = buildActivityFeedPlaceholderSummary(translate);

  return (
    <section className="activity-feed-placeholder" aria-label={translate("workspaceSectionActivity")}>
      <h2 className="workspace-eyebrow">{translate("workspaceSectionActivity")}</h2>
      <p className="activity-feed-placeholder__summary">{summary}</p>
      <div className="activity-feed-placeholder__body">
        <p>{translate("workspaceActivityPlaceholderBody")}</p>
      </div>
    </section>
  );
}
