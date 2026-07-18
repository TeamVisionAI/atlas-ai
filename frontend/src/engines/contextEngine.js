import { MILESTONES } from "../types/milestones";
import { getTimeGreetingKey } from "./executiveDashboardViewModel";

const ACCENT_ACTIONS = new Set([
  "send_zoom_link",
  "send_office_location",
  "schedule",
  "send_missed_appointment"
]);

const ACTION_PRESENTATION = {
  call: {
    icon: "📞",
    titleKey: "missionControlActionCall",
    subtitleKey: null
  },
  whatsapp: {
    icon: "💬",
    titleKey: "missionControlActionWhatsapp",
    subtitleKey: "missionControlActionWhatsappSubtitle"
  },
  send_zoom_link: {
    icon: "🎥",
    titleKey: "missionControlActionSendZoom",
    subtitleKey: "missionControlActionSendZoomSubtitle"
  },
  send_office_location: {
    icon: "📍",
    titleKey: "missionControlActionSendOffice",
    subtitleKey: "missionControlActionSendOfficeSubtitle"
  },
  schedule: {
    icon: "📅",
    titleKey: "missionControlActionSchedule",
    subtitleKey: "missionControlActionScheduleSubtitle"
  },
  reschedule: {
    icon: "📅",
    titleKey: "missionControlActionReschedule",
    subtitleKey: "missionControlActionRescheduleSubtitle"
  },
  notes: {
    icon: "📝",
    titleKey: "missionControlActionNotes",
    subtitleKey: "missionControlActionNotesSubtitle"
  },
  send_missed_appointment: {
    icon: "📨",
    titleKey: "missionControlActionMissedAppointment",
    subtitleKey: "missionControlActionMissedAppointmentSubtitle"
  }
};

function resolveVariant(actionId, priority) {
  if (priority === "primary") {
    if (actionId === "call") {
      return "primary";
    }

    if (ACCENT_ACTIONS.has(actionId)) {
      return "accent";
    }

    return actionId === "whatsapp" ? "primary" : "accent";
  }

  return "default";
}

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

function buildAiBriefPreviewLines(workspace, workflowState, translate) {
  const effectiveState = mergeWorkflowState(workflowState, workspace?.raw?.agentState);
  const lines = [...(workspace?.aiBriefLines || [])];

  if (effectiveState.outcome === "Recruited" && effectiveState.onboardingUnlocked) {
    lines.push(translate("missionControlAiBriefOnboardingReady"));
  }

  return lines.slice(0, 5);
}

/**
 * Maps backend availableActions to existing Next Actions cards. Presentation only.
 */
export function buildNextActions(context) {
  const { workspace, availableActions, onAction, translate } = context;
  const actions = availableActions || workspace?.availableActions || [];

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
        variant: resolveVariant(id, priority),
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
    aiBriefLines: buildAiBriefPreviewLines(workspace, workflowState, translate),
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
