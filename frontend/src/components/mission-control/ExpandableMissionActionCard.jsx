import ActionCard from "../design-system/ActionCard";
import MissionActionInlineForm from "./MissionActionInlineForm";
import {
  resolvesToInlineForm,
  isImmediateMissionAction
} from "./missionActionFormRegistry";
import "./ExpandableMissionActionCard.css";

export default function ExpandableMissionActionCard({
  action,
  cardProps,
  formType,
  expanded = false,
  active = true,
  phone,
  prospect,
  mission,
  conversationOutcome,
  workflowGate,
  rawWorkflowGate,
  recruiterName,
  currentUser = null,
  submitting = false,
  error = null,
  translate,
  onToggle,
  onImmediateAction,
  onScheduleSubmit,
  onOutcomeComplete,
  onQualificationSaved,
  onQualificationDraftChange,
  onCancel
}) {
  const resolvedFormType = formType || resolvesToInlineForm(action.id, mission);

  function handleHeaderClick() {
    if (isImmediateMissionAction(action.id)) {
      onImmediateAction?.(action.id);
      return;
    }

    onToggle?.(action.id);
  }

  return (
    <article
      className={`mission-action-card${expanded ? " mission-action-card--expanded" : ""}`}
      aria-expanded={expanded || undefined}
    >
      <ActionCard
        {...cardProps}
        className="mission-action-card__header"
        onClick={handleHeaderClick}
        disabled={submitting}
      />

      {expanded ? (
        <div className="mission-action-card__panel">
          <MissionActionInlineForm
            actionId={action.id}
            formType={resolvedFormType}
            active={active}
            phone={phone}
            prospect={prospect}
            mission={mission}
            conversationOutcome={conversationOutcome}
            workflowGate={workflowGate}
            rawWorkflowGate={rawWorkflowGate}
            recruiterName={recruiterName}
            currentUser={currentUser}
            submitting={submitting}
            error={error}
            translate={translate}
            onScheduleSubmit={onScheduleSubmit}
            onOutcomeComplete={onOutcomeComplete}
            onQualificationSaved={onQualificationSaved}
            onQualificationDraftChange={onQualificationDraftChange}
            onCancel={onCancel}
          />
        </div>
      ) : null}
    </article>
  );
}
