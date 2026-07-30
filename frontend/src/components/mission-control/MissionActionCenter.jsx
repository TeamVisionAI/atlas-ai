import { useLanguage } from "../../i18n/LanguageContext";
import { buildMissionActionCard } from "./missionActionUtils";
import {
  buildMissionActionList,
  resolvesToInlineForm
} from "./missionActionFormRegistry";
import ExpandableMissionActionCard from "./ExpandableMissionActionCard";
import "./MissionActionCenter.css";

export default function MissionActionCenter({
  mission,
  phone,
  prospect,
  conversationOutcome,
  workflowGate,
  rawWorkflowGate = null,
  recruiterName = "",
  expandedActionId = null,
  onExpandedActionIdChange,
  busy = false,
  submitting = false,
  submitError = null,
  onImmediateAction,
  onScheduleSubmit,
  onOutcomeComplete,
  onQualificationSaved,
  onQualificationDraftChange,
  onCancel
}) {
  const { translate } = useLanguage();
  const actions = buildMissionActionList(mission, conversationOutcome, translate);

  if (!actions.length) {
    return null;
  }

  function handleToggle(actionId) {
    const next = expandedActionId === actionId ? null : actionId;
    onExpandedActionIdChange?.(next);
  }

  function handleCancel() {
    onExpandedActionIdChange?.(null);
    onCancel?.();
  }

  return (
    <section className="mission-action-center" aria-busy={busy || submitting || undefined}>
      <h3 className="mission-action-center__title">{translate("missionControlMissionActions")}</h3>
      <div className="mission-action-center__list">
        {actions.map((action, index) => {
          const formType = resolvesToInlineForm(action.id, mission);
          const expanded = expandedActionId === action.id;
          const cardProps = buildMissionActionCard(action, {
            translate,
            phone,
            featured: index === 0 && !expanded,
            variantOverride: index === 0 ? "accent" : undefined
          });

          return (
            <ExpandableMissionActionCard
              key={action.id}
              action={action}
              cardProps={cardProps}
              formType={formType}
              expanded={expanded}
              active={expanded}
              phone={phone}
              prospect={prospect}
              mission={mission}
              conversationOutcome={conversationOutcome}
              workflowGate={workflowGate}
              rawWorkflowGate={rawWorkflowGate}
              recruiterName={recruiterName}
              submitting={submitting}
              error={expanded ? submitError : null}
              translate={translate}
              onToggle={handleToggle}
              onImmediateAction={onImmediateAction}
              onScheduleSubmit={onScheduleSubmit}
              onOutcomeComplete={onOutcomeComplete}
              onQualificationSaved={onQualificationSaved}
              onQualificationDraftChange={onQualificationDraftChange}
              onCancel={handleCancel}
            />
          );
        })}
      </div>
    </section>
  );
}
