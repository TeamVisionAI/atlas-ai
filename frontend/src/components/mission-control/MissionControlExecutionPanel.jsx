import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasBrief from "../design-system/AtlasBrief";
import ExecutiveSection from "../design-system/ExecutiveSection";
import { buildStageRecruiterBrief } from "../../engines/missionExecutionPanelViewModel";
import { buildProspectWorkspacePath } from "../../utils/prospectRoutes";
import "./MissionControlExecutionPanel.css";

/**
 * Reference-only panels for Mission Control — no workflow execution entry points.
 * Order: Recruiter Brief → Communication History
 */
export default function MissionControlExecutionPanel({
  workspace,
  primaryMission = null,
  expandedBrief = null,
  phone
}) {
  const { translate } = useLanguage();
  const briefBullets = buildStageRecruiterBrief(workspace, primaryMission, translate);
  const workspacePath = phone ? buildProspectWorkspacePath({ phone }) : null;

  if (!briefBullets.length && !workspacePath) {
    return null;
  }

  return (
    <div className="mission-control-reference">
      {briefBullets.length ? (
        <ExecutiveSection className="mission-control-reference__section">
          <div className="mission-control-execution__brief">
            <AtlasBrief bullets={briefBullets} expandedContent={expandedBrief} />
          </div>
        </ExecutiveSection>
      ) : null}

      {workspacePath ? (
        <section
          className="mission-control-reference__section mission-control-reference__history"
          aria-labelledby="mc-communication-history"
        >
          <h3 id="mc-communication-history" className="mission-control-execution__title">
            {translate("missionControlCommunicationHistory")}
          </h3>
          <p className="mission-control-execution__history-link">
            <Link to={workspacePath}>{translate("missionControlViewCommunicationHistory")}</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
