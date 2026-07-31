import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import MissionControlContextPanel from "./MissionControlContextPanel";
import ExecutiveDashboardLinks from "./ExecutiveDashboardLinks";

function ExecutiveInsightsSection({
  prospectContext,
  missionControlLoading,
  missionControlError,
  prospectCoreId
}) {
  const { translate } = useLanguage();

  return (
    <section
      className="prospect-workspace__executive-insights"
      aria-labelledby="executive-insights-heading"
    >
      <header className="prospect-workspace__executive-insights-header">
        <h2 id="executive-insights-heading" className="workspace-eyebrow">
          {translate("workspaceSectionExecutiveInsights")}
        </h2>
        <p className="prospect-workspace__executive-insights-intro">
          {translate("workspaceExecutiveInsightsIntro")}
        </p>
      </header>

      <div className="prospect-workspace__executive-insights-grid">
        <ExecutiveDashboardLinks prospectCoreId={prospectCoreId} />
        <MissionControlContextPanel
          prospectContext={prospectContext}
          loading={missionControlLoading}
          error={missionControlError}
        />
      </div>
    </section>
  );
}

export default memo(ExecutiveInsightsSection);
