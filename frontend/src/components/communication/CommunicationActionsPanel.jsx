import { useMemo } from "react";
import ActionCard from "../design-system/ActionCard";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  buildCommunicationActionCard,
  resolveCommunicationActions
} from "../../engines/communicationActionEngine";
import "../mission-control/MissionControlPermanentActions.css";

export default function CommunicationActionsPanel({
  workspace,
  organizationSettings = null,
  onAction,
  busy = false
}) {
  const { translate } = useLanguage();

  const actions = useMemo(
    () => resolveCommunicationActions(workspace, { translate, organizationSettings }),
    [workspace, translate, organizationSettings]
  );

  const cards = actions.map((action) =>
    buildCommunicationActionCard(action, {
      onClick: () => onAction?.(action.id),
      busy
    })
  );

  return (
    <section
      className="mc-permanent-actions mc-permanent-actions--always-visible"
      aria-label={translate("missionControlCommunicationActionsLabel")}
    >
      <h3 className="mc-permanent-actions__title">
        {translate("missionControlCommunicationActionsLabel")}
      </h3>
      <div className="mc-permanent-actions__grid">
        {cards.map((card) => (
          <ActionCard key={card.id} {...card} />
        ))}
      </div>
    </section>
  );
}
