import { MILESTONES } from "../types/milestones";
import { getTimeGreetingKey } from "./executiveDashboardViewModel";
import {
  ACTION_PRESENTATION,
  resolveActionVariant
} from "./actionPresentation";
import { filterPanelCommunicationActions } from "./communicationActionEngine";

function mergeWorkflowState(localWorkflowState, agentState) {
  if (!agentState) {
    return localWorkflowState;
  }

  return {
    ...localWorkflowState,
    outcome: agentState.outcome ?? localWorkflowState.outcome,
    followUpDate: agentState.followUpDate ?? localWorkflowState.followUpDate,
    followUpTime: agentState.followUpTime ?? localWorkflowState.followUpTime,
    futureReminder: agentState.futureReminder ?? localWorkflowState.futureReminder,
    orientationScheduled:
      agentState.orientationScheduled ?? localWorkflowState.orientationScheduled,
    onboardingUnlocked:
      agentState.onboardingUnlocked ?? localWorkflowState.onboardingUnlocked,
    notInterestedReason:
      agentState.closureReason ?? localWorkflowState.notInterestedReason
  };
}

/**
 * Agent workflow milestones overlay local UI state on backend-derived milestone labels.
 */
export function resolveDisplayMilestone(workspace, workflowState = {}) {
  const effectiveState = mergeWorkflowState(workflowState, workspace?.raw?.agentState);

  if (effectiveState.milestone) {
    return effectiveState.milestone;
  }

  if (effectiveState.outcome === "Recruited") {
    return effectiveState.orientationScheduled
      ? MILESTONES.ORIENTATION_SCHEDULED
      : MILESTONES.RECRUITED;
  }

  if (effectiveState.outcome === "Needs More Time") {
    return MILESTONES.FOLLOW_UP;
  }

  if (effectiveState.outcome === "Not Interested") {
    return MILESTONES.CLOSED;
  }

  if (effectiveState.outcome === "No Show") {
    return MILESTONES.FOLLOW_UP;
  }

  return workspace?.prospect?.milestone || MILESTONES.NEW_LEAD;
}

export function isInterviewComplete(workflowState, workspace) {
  const effectiveState = mergeWorkflowState(workflowState, workspace?.raw?.agentState);
  return Boolean(effectiveState?.outcome);
}

function buildAiBriefPreviewLines(workspace) {
  return [...(workspace?.aiBriefLines || [])].slice(0, 5);
}

/**
 * Maps backend availableActions to existing Next Actions cards. Presentation only.
 */
export function buildNextActions(context) {
  const { workspace, availableActions, onAction, translate } = context;
  const actions = filterPanelCommunicationActions(
    availableActions || workspace?.availableActions || []
  );

  return actions
    .map(({ id, priority }) => {
      const presentation = ACTION_PRESENTATION[id];

      if (!presentation || !translate) {
        return null;
      }

      const subtitle =
        id === "call"
          ? context.workspace?.phone || "—"
          : presentation.subtitleKey
            ? translate(presentation.subtitleKey)
            : "";

      return {
        id,
        icon: presentation.icon,
        title: translate(presentation.titleKey),
        subtitle,
        variant: resolveActionVariant(id, priority),
        onClick: () => onAction?.(id)
      };
    })
    .filter(Boolean);
}

/**
 * @param {Object} params
 * @param {import("../types/missionControl").AgentWorkspaceModel} params.workspace
 * @param {import("../types/organization").OrganizationSettings} [params.organizationSettings]
 * @param {Object} params.workflowState
 * @param {Object} [params.handlers]
 * @param {Function} params.translate
 */
export function buildWorkspaceContext({
  workspace,
  organizationSettings = null,
  workflowState,
  handlers = {},
  translate
}) {
  const effectiveWorkflowState = mergeWorkflowState(
    workflowState,
    workspace?.raw?.agentState
  );
  const milestone = resolveDisplayMilestone(workspace, workflowState);
  const interviewComplete = isInterviewComplete(workflowState, workspace);

  const context = {
    workspace,
    organizationSettings,
    availableActions: workspace.availableActions || [],
    workflowState: effectiveWorkflowState,
    interviewType: workspace.prospect.interviewType,
    language: workspace.prospect.language,
    milestone,
    interviewComplete,
    prospect: {
      ...workspace.prospect,
      milestone
    },
    aiBriefLines: buildAiBriefPreviewLines(workspace),
    expandedBrief: workspace.expandedBrief,
    nextActions: [],
    translate,
    ...handlers
  };

  context.nextActions = buildNextActions(context);

  return context;
}

export function getTimeGreeting(translate) {
  if (typeof translate === "function") {
    return translate(getTimeGreetingKey());
  }

  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good Morning";
  }

  if (hour < 17) {
    return "Good Afternoon";
  }

  return "Good Evening";
}

export function buildAgentMetrics(dashboard) {
  return {
    interviews: dashboard?.confirmed ?? 0,
    followUps: dashboard?.activeConversations ?? 0,
    tasks: dashboard?.totalProspects ?? 0
  };
}
