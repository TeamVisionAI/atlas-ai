import { useLanguage } from "../../../i18n/LanguageContext";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import { isMetaReviewWorkspaceActive } from "../../../config/metaReviewMode";
import WorkspaceSection from "../../../components/prospect-workspace/WorkspaceSection";
import { buildCoachAccordionSummary } from "../../../engines/prospectWorkspaceViewModel";

export default function ProspectCoachPanel({ collapsible = true }) {
  const { translate } = useLanguage();
  const { user } = useWorkspace();

  if (isMetaReviewWorkspaceActive(user)) {
    return null;
  }
  const coachSummary = buildCoachAccordionSummary(translate);

  return (
    <section className="prospect-workspace__reference-section" aria-labelledby="prospect-coach-heading">
      <h2 id="prospect-coach-heading" className="workspace-eyebrow">
        {translate("workspaceSectionCoach")}
      </h2>

      <WorkspaceSection
        title={translate("workspaceDetailsCoach")}
        summary={coachSummary}
        collapsible={collapsible}
        defaultExpanded={false}
      >
        <div className="prospect-coach-placeholder">
          <p className="prospect-coach-placeholder__eyebrow">
            {translate("workspaceCoachComingSoon")}
          </p>
          <p>{translate("workspaceCoachDescription")}</p>
        </div>
      </WorkspaceSection>
    </section>
  );
}
