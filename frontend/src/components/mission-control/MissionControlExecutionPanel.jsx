import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasBrief from "../design-system/AtlasBrief";
import ExecutiveSection from "../design-system/ExecutiveSection";
import {
  buildProspectSnapshotFields,
  buildStageChecklistItems,
  buildStageRecruiterBrief
} from "../../engines/missionExecutionPanelViewModel";
import { buildProspectWorkspacePath } from "../../utils/prospectRoutes";
import "./MissionControlExecutionPanel.css";

function ChecklistStatusIcon({ status }) {
  if (status === "current") {
    return <span aria-hidden="true">▶</span>;
  }

  return <span aria-hidden="true">○</span>;
}

export default function MissionControlExecutionPanel({
  workspace,
  primaryMission = null,
  expandedBrief = null,
  phone,
  onChecklistAction,
  checklistBusy = false
}) {
  const { translate } = useLanguage();
  const snapshotFields = buildProspectSnapshotFields(workspace, translate);
  const checklistItems = buildStageChecklistItems(workspace, primaryMission, translate);
  const briefBullets = buildStageRecruiterBrief(workspace, primaryMission, translate);
  const workspacePath = phone ? buildProspectWorkspacePath({ phone }) : null;

  if (!snapshotFields.length && !checklistItems.length && !briefBullets.length) {
    return null;
  }

  function handleChecklistClick(item) {
    if (!item.actionId && !item.scrollTarget) {
      return;
    }

    onChecklistAction?.({
      actionId: item.actionId,
      scrollTarget: item.scrollTarget,
      item
    });
  }

  return (
    <ExecutiveSection className="mission-control-execution">
      {snapshotFields.length ? (
        <section className="mission-control-execution__block" aria-labelledby="mc-prospect-snapshot">
          <h3 id="mc-prospect-snapshot" className="mission-control-execution__title">
            {translate("missionControlProspectSnapshot")}
          </h3>
          <dl className="mission-control-execution__snapshot">
            {snapshotFields.map((field) => (
              <div key={field.id} className="mission-control-execution__snapshot-item">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {checklistItems.length ? (
        <section className="mission-control-execution__block" aria-labelledby="mc-stage-checklist">
          <h3 id="mc-stage-checklist" className="mission-control-execution__title">
            {translate("missionControlStageChecklist")}
          </h3>
          <ul className="mission-control-execution__checklist">
            {checklistItems.map((item) => {
              const isActionable = Boolean(item.actionId || item.scrollTarget);

              return (
                <li
                  key={item.id}
                  className={`mission-control-execution__checklist-item mission-control-execution__checklist-item--${item.status}${isActionable ? " mission-control-execution__checklist-item--actionable" : ""}`}
                >
                  <ChecklistStatusIcon status={item.status} />
                  {isActionable ? (
                    <button
                      type="button"
                      className="mission-control-execution__checklist-action"
                      disabled={checklistBusy}
                      onClick={() => handleChecklistClick(item)}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {briefBullets.length ? (
        <div className="mission-control-execution__brief">
          <AtlasBrief bullets={briefBullets} expandedContent={expandedBrief} />
        </div>
      ) : null}

      {workspacePath ? (
        <p className="mission-control-execution__history-link">
          <Link to={workspacePath}>{translate("missionControlViewCommunicationHistory")}</Link>
        </p>
      ) : null}
    </ExecutiveSection>
  );
}
