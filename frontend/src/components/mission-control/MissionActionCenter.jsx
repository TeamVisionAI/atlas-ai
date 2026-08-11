import { useEffect, useMemo, useRef } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { buildMissionActionCard } from "./missionActionUtils";
import {
  buildMissionActionList,
  resolvesToInlineForm
} from "./missionActionFormRegistry";
import ExpandableMissionActionCard from "./ExpandableMissionActionCard";
import {
  filterMissionActionsForInterviewWorkflow,
  resolveRecommendedMissionActionId
} from "../../engines/interviewWorkflowPresentationEngine";
import "./MissionActionCenter.css";

export default function MissionActionCenter({
  mission,
  phone,
  prospect,
  conversationOutcome,
  workflowGate,
  rawWorkflowGate = null,
  recruiterName = "",
  currentUser = null,
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
  const actions = useMemo(
    () =>
      filterMissionActionsForInterviewWorkflow(
        buildMissionActionList(mission, conversationOutcome, translate, workflowGate),
        workflowGate
      ),
    [mission, conversationOutcome, translate, workflowGate]
  );

  const recommendedActionId = useMemo(
    () => resolveRecommendedMissionActionId(actions, workflowGate),
    [actions, workflowGate]
  );

  const userDismissedPanelRef = useRef(false);
  const previousGateActiveRef = useRef(Boolean(workflowGate?.active));

  useEffect(() => {
    const gateActive = Boolean(workflowGate?.active);

    if (gateActive && !previousGateActiveRef.current) {
      userDismissedPanelRef.current = false;
    }

    if (!gateActive) {
      userDismissedPanelRef.current = false;
    }

    previousGateActiveRef.current = gateActive;
  }, [workflowGate?.active]);

  useEffect(() => {
    if (!workflowGate?.active || expandedActionId || userDismissedPanelRef.current) {
      return;
    }

    if (recommendedActionId) {
      onExpandedActionIdChange?.(recommendedActionId);
    }
  }, [expandedActionId, onExpandedActionIdChange, recommendedActionId, workflowGate?.active]);

  if (!actions.length) {
    return null;
  }

  function markPanelDismissed(actionId) {
    if (workflowGate?.active && actionId === recommendedActionId) {
      userDismissedPanelRef.current = true;
    }
  }

  function handleToggle(actionId) {
    const next = expandedActionId === actionId ? null : actionId;

    if (next === null) {
      markPanelDismissed(actionId);
    }

    onExpandedActionIdChange?.(next);
  }

  function handleCancel() {
    if (expandedActionId) {
      markPanelDismissed(expandedActionId);
    }

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
          const featured = action.id === recommendedActionId && !expanded;
          const cardProps = buildMissionActionCard(action, {
            translate,
            phone,
            featured,
            variantOverride: featured ? "accent" : undefined
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
              currentUser={currentUser}
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
