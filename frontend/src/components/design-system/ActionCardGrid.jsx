import ActionCard from "./ActionCard";
import "./ActionCardGrid.css";

export default function ActionCardGrid({ primaryAction = null, secondaryActions = [] }) {
  if (!primaryAction && !secondaryActions.length) {
    return null;
  }

  return (
    <div className="action-card-grid">
      {primaryAction ? (
        <div className="action-card-grid__primary">
          <ActionCard {...primaryAction} featured />
        </div>
      ) : null}

      {secondaryActions.length ? (
        <div className="action-card-grid__secondary">
          {secondaryActions.map((action) => (
            <ActionCard key={action.id || action.title} {...action} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
