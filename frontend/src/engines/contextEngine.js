import { MILESTONES } from "../types/milestones";

const OFFICE_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const ZOOM_LINK = "https://zoom.us/j/teamvision-interview";

/**
 * Agent workflow milestones overlay local UI state on backend-derived milestone labels.
 */
export function resolveDisplayMilestone(workspace, workflowState = {}) {
  if (workflowState.milestone) {
    return workflowState.milestone;
  }

  if (workflowState.outcome === "Recruited") {
    return workflowState.orientationScheduled
      ? MILESTONES.ORIENTATION_SCHEDULED
      : MILESTONES.RECRUITED;
  }

  if (workflowState.outcome === "Needs More Time") {
    return MILESTONES.FOLLOW_UP;
  }

  if (workflowState.outcome === "Not Interested") {
    return MILESTONES.CLOSED;
  }

  return workspace?.prospect?.milestone || MILESTONES.NEW_LEAD;
}

export function isInterviewComplete(workflowState) {
  return Boolean(workflowState?.outcome);
}

function buildAiBriefPreviewLines(workspace, workflowState) {
  const lines = [...(workspace?.aiBriefLines || [])];

  if (workflowState.outcome === "Recruited" && workflowState.onboardingUnlocked) {
    lines.push("Onboarding package is ready to send.");
  }

  return lines.slice(0, 5);
}

/**
 * Context-aware next actions. Presentation only — uses backend brain/rules fields.
 */
export function buildNextActions(context) {
  const { workspace, workflowState, onNotes } = context;
  const phone = workspace?.phone || "";
  const interviewType = workspace?.prospect?.interviewType;
  const milestone = resolveDisplayMilestone(workspace, workflowState);
  const interviewComplete = isInterviewComplete(workflowState);
  const actions = [];

  const pushCallAndWhatsApp = () => {
    if (phone) {
      actions.push({
        id: "call",
        icon: "📞",
        title: "Call",
        subtitle: phone,
        onClick: () => window.open(`tel:${phone}`, "_self"),
        variant: "primary"
      });

      actions.push({
        id: "whatsapp",
        icon: "💬",
        title: "WhatsApp",
        subtitle: "Open conversation",
        onClick: () =>
          window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank"),
        variant: "default"
      });
    }
  };

  if (
    workflowState.outcome === "Recruited" ||
    milestone === MILESTONES.ORIENTATION_SCHEDULED ||
    milestone === MILESTONES.ONBOARDING
  ) {
    pushCallAndWhatsApp();

    actions.push({
      id: "onboarding-package",
      icon: "📦",
      title: "Send Onboarding Package",
      subtitle: "Recruit onboarding materials",
      onClick: context.onSendOnboarding || (() => {}),
      variant: "accent"
    });

    actions.push({
      id: "notes",
      icon: "📝",
      title: "Notes",
      subtitle: "Add agent notes",
      onClick: onNotes || (() => {}),
      variant: "default"
    });

    return actions;
  }

  if (interviewComplete && workflowState.outcome === "No Show") {
    pushCallAndWhatsApp();

    actions.push({
      id: "missed-appointment",
      icon: "📨",
      title: "Send Missed Appointment",
      subtitle: "Follow up on no-show",
      onClick: () => {},
      variant: "accent"
    });

    actions.push({
      id: "reschedule",
      icon: "📅",
      title: "Reschedule",
      subtitle: "Pick a new interview time",
      onClick: context.onReschedule || (() => {}),
      variant: "default"
    });

    actions.push({
      id: "notes",
      icon: "📝",
      title: "Notes",
      subtitle: "Add agent notes",
      onClick: onNotes || (() => {}),
      variant: "default"
    });

    return actions.slice(0, 5);
  }

  if (interviewComplete) {
    pushCallAndWhatsApp();

    actions.push({
      id: "notes",
      icon: "📝",
      title: "Notes",
      subtitle: "Add agent notes",
      onClick: onNotes || (() => {}),
      variant: "default"
    });

    return actions;
  }

  pushCallAndWhatsApp();

  if (interviewType === "Zoom") {
    actions.push({
      id: "zoom-link",
      icon: "🎥",
      title: "Send Zoom Link",
      subtitle: "Share interview link",
      onClick: () => window.open(ZOOM_LINK, "_blank"),
      variant: "accent"
    });
  }

  if (interviewType === "Office") {
    actions.push({
      id: "office-location",
      icon: "📍",
      title: "Send Office Location",
      subtitle: "Team Vision Office, Doral",
      onClick: () =>
        window.open(
          `https://maps.google.com/?q=${encodeURIComponent(OFFICE_ADDRESS)}`,
          "_blank"
        ),
      variant: "accent"
    });
  }

  if (
    milestone === MILESTONES.INTERVIEW_CONFIRMED ||
    milestone === MILESTONES.INTERVIEW_SCHEDULED
  ) {
    actions.push({
      id: "reschedule",
      icon: "📅",
      title: "Reschedule",
      subtitle: "Change interview time",
      onClick: context.onReschedule || (() => {}),
      variant: "default"
    });
  } else if (milestone === MILESTONES.QUALIFYING || !interviewType) {
    actions.push({
      id: "schedule",
      icon: "📅",
      title: "Schedule Interview",
      subtitle: "Book the next milestone",
      onClick: context.onSchedule || (() => {}),
      variant: "accent"
    });
  }

  actions.push({
    id: "notes",
    icon: "📝",
    title: "Notes",
    subtitle: "Add agent notes",
    onClick: onNotes || (() => {}),
    variant: "default"
  });

  return actions.slice(0, 5);
}

/**
 * @param {Object} params
 * @param {import("../types/missionControl").AgentWorkspaceModel} params.workspace
 * @param {Object} params.workflowState
 * @param {Object} [params.handlers]
 */
export function buildWorkspaceContext({
  workspace,
  workflowState,
  handlers = {}
}) {
  const milestone = resolveDisplayMilestone(workspace, workflowState);
  const interviewComplete = isInterviewComplete(workflowState);

  const context = {
    workspace,
    workflowState,
    interviewType: workspace.prospect.interviewType,
    language: workspace.prospect.language,
    milestone,
    interviewComplete,
    prospect: {
      ...workspace.prospect,
      milestone
    },
    aiBriefLines: buildAiBriefPreviewLines(workspace, workflowState),
    expandedBrief: workspace.expandedBrief,
    nextActions: [],
    ...handlers
  };

  context.nextActions = buildNextActions(context);

  return context;
}

export function getTimeGreeting() {
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
