import ActionCard from "../design-system/ActionCard";
import { buildMissionActionCard } from "./missionActionUtils";
import "./MissionActionCenter.css";

export default function MissionActionCenter({
  mission,
  translate,
  phone,
  onSecondaryAction,
  busy = false
}) {
  const secondaryActions = (mission?.secondaryActions || []).map((action) =>
    buildMissionActionCard(action, {
      translate,
      phone,
      onClick: () => onSecondaryAction?.(action.id, mission)
    })
  );

  if (!secondaryActions.length) {
    return null;
  }

  return (
    <div className="mission-action-center" aria-busy={busy || undefined}>
      <div className="mission-action-center__supporting">
        <p className="mission-action-center__supporting-label">
          {translate("missionControlSupportingTools")}
        </p>
        <div className="mission-action-center__supporting-grid">
          {secondaryActions.map((action) => (
            <ActionCard key={action.id || action.title} {...action} disabled={busy} />
          ))}
        </div>
      </div>
    </div>
  );
}
