import ActionCard from "./design-system/ActionCard";
import "./design-system/ActionCardGrid.css";

export type NextActionVariant = "primary" | "default" | "accent";

export interface NextAction {
  id?: string;
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  variant?: NextActionVariant;
}

interface NextActionsProps {
  actions: NextAction[];
}

export default function NextActions({ actions }: NextActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className="action-card-grid__secondary">
      {actions.map((action, index) => (
        <ActionCard
          key={action.id || `${action.title}-${index}`}
          icon={action.icon}
          title={action.title}
          subtitle={action.subtitle}
          variant={action.variant || "default"}
          onClick={action.onClick}
        />
      ))}
    </div>
  );
}
