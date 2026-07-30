import ActionCard from "../design-system/ActionCard";
import ExecutiveBadge from "../design-system/ExecutiveBadge";
import ExecutivePanel from "../design-system/ExecutivePanel";
import {
  buildExecutiveRecommendation,
  getMissionHeroIcon
} from "../../engines/missionPresentationEngine";
import { buildMissionActionCard } from "./missionActionUtils";
import "./MissionCard.css";

function formatDueLabel(dueDate, translate) {
  if (!dueDate) {
    return translate("missionDueToday");
  }

  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);

  if (dueDay.getTime() === today.getTime()) {
    return translate("missionDueToday");
  }

  return due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

export default function MissionCard({
  mission,
  translate,
  phone,
  onPrimaryAction,
  busy = false
}) {
  if (!mission) {
    return null;
  }

  const recommendation = buildExecutiveRecommendation(mission, translate);
  const heroIcon = getMissionHeroIcon(mission.missionType);
  const primaryAction = mission.primaryAction
    ? buildMissionActionCard(mission.primaryAction, {
        translate,
        phone,
        variantOverride: "accent",
        featured: true,
        onClick: () => onPrimaryAction?.(mission.primaryAction.id, mission)
      })
    : null;

  return (
    <ExecutivePanel elevated className="mission-card">
      <header className="mission-card__header">
        <p className="mission-card__eyebrow">{translate("todaysMission")}</p>
        <ExecutiveBadge label={mission.priority} priority={mission.priority} />
      </header>

      <h2 className="mission-card__hero" id={`mission-title-${mission.id}`}>
        <span className="mission-card__hero-icon" aria-hidden="true">
          {heroIcon}
        </span>
        {mission.title}
      </h2>

      <div className="mission-card__recommendation">
        <span className="mission-card__recommendation-label">
          {translate("atlasRecommendationLabel")}
        </span>
        <p className="mission-card__recommendation-text">{recommendation}</p>
      </div>

      <dl className="mission-card__meta-row">
        <div>
          <dt>{translate("missionPriorityLabel")}</dt>
          <dd>{mission.priority}</dd>
        </div>
        <div>
          <dt>{translate("missionEstimatedTime")}</dt>
          <dd>
            {translate("missionEstimatedMinutes", {
              minutes: mission.estimatedMinutes || 2
            })}
          </dd>
        </div>
        <div>
          <dt>{translate("missionDue")}</dt>
          <dd>{formatDueLabel(mission.dueDate, translate)}</dd>
        </div>
      </dl>

      {primaryAction ? (
        <div className="mission-card__actions">
          <ActionCard {...primaryAction} featured disabled={busy} />
        </div>
      ) : null}
    </ExecutivePanel>
  );
}
