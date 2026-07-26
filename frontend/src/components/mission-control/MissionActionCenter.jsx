import ActionCard from "../design-system/ActionCard";
import { buildMissionActionCard } from "./missionActionUtils";
import "./MissionActionCenter.css";

export default function MissionActionCenter({
  mission,
  translate,
  phone,
  onPrimaryAction,
  onSecondaryAction,
  busy = false
}) {
  if (!mission?.primaryAction && !(mission?.secondaryActions || []).length) {
    return null;
  }

  const primaryAction = mission.primaryAction
    ? buildMissionActionCard(mission.primaryAction, {
        translate,
        phone,
        variantOverride: "accent",
        featured: true,
        onClick: () => onPrimaryAction?.(mission.primaryAction.id, mission)
      })
    : null;

  const secondaryActions = (mission.secondaryActions || []).map((action) =>
    buildMissionActionCard(action, {
      translate,
      phone,
      onClick: () => onSecondaryAction?.(action.id, mission)
    })
  );

  function handleRunMission() {
    if (mission.primaryAction) {
      onPrimaryAction?.(mission.primaryAction.id, mission);
    }
  }

  return (
    <div className="mission-action-center" aria-busy={busy || undefined}>
      {primaryAction ? (
        <div className="mission-action-center__featured">
          <ActionCard {...primaryAction} featured disabled={busy} />
        </div>
      ) : null}

      {primaryAction ? (
        <button
          type="button"
          className="mission-action-center__run-mission"
          onClick={handleRunMission}
          disabled={busy}
        >
          <span className="mission-action-center__run-icon" aria-hidden="true">
            ▶
          </span>
          {translate("missionControlRunMission")}
        </button>
      ) : null}

      {secondaryActions.length ? (
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
      ) : null}
    </div>
  );
}
