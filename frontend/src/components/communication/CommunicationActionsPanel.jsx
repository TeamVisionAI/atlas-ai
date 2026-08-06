import { useMemo } from "react";
import ActionCard from "../design-system/ActionCard";
import { useLanguage } from "../../i18n/LanguageContext";
import { resolveCommunicationActions } from "../../engines/communicationActionEngine";
import { buildCommunicationActionCenterCards } from "../../engines/communicationActionCenterPresentation";
import "../mission-control/MissionControlPermanentActions.css";

export default function CommunicationActionsPanel({
  workspace,
  organizationSettings = null,
  onAction,
  onAddNote,
  noteSaving = false,
  busy = false,
  /** Future: Workflow Engine supplies prioritized action ids. */
  actionOrder,
  /** Card order for the Action Center grid (presentation only). */
  cardOrder,
  /** Future: Workflow Engine highlights one recommended card without reordering the grid. */
  recommendedActionId = null
}) {
  const { translate } = useLanguage();

  const actions = useMemo(
    () =>
      resolveCommunicationActions(workspace, {
        translate,
        organizationSettings,
        actionOrder
      }),
    [workspace, translate, organizationSettings, actionOrder]
  );

  const phone = workspace?.phone || workspace?.prospect?.phone || null;

  const cards = useMemo(
    () =>
      buildCommunicationActionCenterCards({
        phone,
        actions,
        translate,
        includeAddNote: Boolean(onAddNote),
        recommendedActionId,
        ...(cardOrder ? { order: cardOrder } : {})
      }),
    [phone, actions, translate, onAddNote, recommendedActionId, cardOrder]
  );

  function handleCardClick(cardId) {
    if (cardId === "call") {
      onAction?.("call");
      return;
    }

    if (cardId === "add_note") {
      onAddNote?.();
      return;
    }

    onAction?.(cardId);
  }

  return (
    <section
      className="mc-permanent-actions mc-permanent-actions--always-visible"
      aria-label={translate("missionControlCommunicationActionsLabel")}
    >
      <h3 className="mc-permanent-actions__title">
        {translate("missionControlCommunicationActionsLabel")}
      </h3>
      <div className="mc-permanent-actions__grid">
        {cards.map((card) => {
          const disabled =
            busy ||
            card.enabled === false ||
            (card.id === "add_note" && noteSaving);

          return (
            <ActionCard
              key={card.id}
              icon={card.icon}
              title={card.title}
              subtitle={card.subtitle}
              variant={card.variant}
              featured={card.recommended}
              disabled={disabled}
              className={card.recommended ? "action-card--recommended" : ""}
              onClick={() => handleCardClick(card.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
