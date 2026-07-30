import ActionCard from "../design-system/ActionCard";
import { useLanguage } from "../../i18n/LanguageContext";
import { buildMissionActionCard } from "./missionActionUtils";
import "./MissionControlPermanentActions.css";

const PERMANENT_ACTIONS = [{ id: "notes", featured: false }];

export default function MissionControlPermanentActions({
  phone,
  onAction,
  busy = false
}) {
  const { translate } = useLanguage();

  const cards = PERMANENT_ACTIONS.map((action) =>
    buildMissionActionCard(
      { id: action.id },
      {
        translate,
        phone,
        featured: action.featured,
        variantOverride: "default",
        onClick: () => onAction?.(action.id)
      }
    )
  );

  return (
    <section className="mc-permanent-actions" aria-label={translate("missionControlPermanentActionsLabel")}>
      <h3 className="mc-permanent-actions__title">{translate("missionControlPermanentActionsLabel")}</h3>
      <div className="mc-permanent-actions__grid">
        {cards.map((card) => (
          <ActionCard key={card.id} {...card} disabled={busy} />
        ))}
      </div>
    </section>
  );
}
