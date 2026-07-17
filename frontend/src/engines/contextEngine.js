import { MILESTONES } from "../types/milestones";
import { normalizeProspectLanguage } from "../types/language";
import { formatTextWithDates } from "../utils/dateFormatter";

const OFFICE_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const ZOOM_LINK = "https://zoom.us/j/teamvision-interview";

export function normalizeInterviewType(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return "Zoom";
  }

  if (
    normalized.includes("office") ||
    normalized.includes("person") ||
    normalized.includes("in person")
  ) {
    return "Office";
  }

  return value;
}

function formatField(field) {
  if (!field) {
    return field;
  }

  return field.charAt(0).toUpperCase() + field.slice(1);
}

function formatLocation(prospect) {
  if (!prospect?.city) {
    return "—";
  }

  return prospect.state ? `${prospect.city}, ${prospect.state}` : prospect.city;
}

export function deriveMilestone(mission, workflowState = {}) {
  if (workflowState.milestone) {
    return workflowState.milestone;
  }

  const step = mission?.brain?.currentStep;
  const missing = mission?.brain?.missingFields || [];

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

  if (step === "CONFIRMED") {
    return MILESTONES.INTERVIEW_CONFIRMED;
  }

  if (missing.includes("schedule") || step === "SCHEDULE") {
    return MILESTONES.INTERVIEW_SCHEDULED;
  }

  if (missing.length) {
    return MILESTONES.QUALIFYING;
  }

  return MILESTONES.NEW_LEAD;
}

export function isInterviewComplete(workflowState) {
  return Boolean(workflowState?.outcome);
}

export function buildAiBriefLines(mission, workflowState) {
  const summaryItems = Array.isArray(mission?.atlasBrief?.summary)
    ? mission.atlasBrief.summary
    : mission?.atlasBrief?.summary
      ? [mission.atlasBrief.summary]
      : [];

  const milestone = deriveMilestone(mission, workflowState);
  const lines = [`Next milestone: ${milestone}`];

  if (summaryItems[0]) {
    lines.push(formatTextWithDates(summaryItems[0]));
  }

  if (summaryItems[1]) {
    lines.push(formatTextWithDates(summaryItems[1]));
  }

  const missing = mission?.brain?.missingFields || [];

  if (missing.length && !workflowState.outcome) {
    lines.push(`Still needed: ${formatField(missing[0])}`);
  }

  if (workflowState.outcome === "Recruited" && workflowState.onboardingUnlocked) {
    lines.push("Onboarding package is ready to send.");
  }

  return lines.slice(0, 5);
}

export function buildExpandedBrief(mission, workflowState) {
  const missing = mission?.brain?.missingFields || [];

  const suggestedReply = missing.includes("schedule")
    ? "What day and time works best for your interview?"
    : missing.includes("occupation")
      ? "What do you do for work right now?"
      : "Thanks for reaching out — happy to help with the next step.";

  const summaryItems = Array.isArray(mission?.atlasBrief?.summary)
    ? mission.atlasBrief.summary
    : [];

  return {
    summary: summaryItems.map((item) => formatTextWithDates(item)),
    suggestedReply,
    importantNotes: [
      mission?.businessRules?.emailRequired
        ? "Zoom interview requires email before confirmation."
        : null,
      !mission?.businessRules?.localProspect
        ? "Outside local radius — default to Zoom."
        : null
    ].filter(Boolean),
    objections:
      mission?.brain?.intent === "COST"
        ? ["Asked about registration cost"]
        : mission?.brain?.intent === "SALARY"
          ? ["Asked about income potential"]
          : [],
    aiRecommendation: `Focus on reaching the ${deriveMilestone(mission, workflowState)} milestone.`
  };
}

/**
 * Context-aware next actions. Only returns relevant actions — never disabled placeholders.
 */
export function buildNextActions(context) {
  const { mission, workflowState, onNotes } = context;
  const phone = mission?.prospect?.phone || "";
  const interviewType = normalizeInterviewType(mission?.brain?.interviewType);
  const milestone = deriveMilestone(mission, workflowState);
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

export function buildWorkspaceContext({
  mission,
  dashboardProspect,
  workflowState,
  handlers = {}
}) {
  const interviewType = normalizeInterviewType(mission?.brain?.interviewType);
  const language = normalizeProspectLanguage(mission?.brain?.language);
  const milestone = deriveMilestone(mission, workflowState);
  const interviewComplete = isInterviewComplete(workflowState);

  const context = {
    mission,
    dashboardProspect,
    workflowState,
    interviewType,
    language,
    milestone,
    interviewComplete,
    prospect: {
      name: mission?.prospect?.name || "—",
      phone: mission?.prospect?.phone || "—",
      location: formatLocation(mission?.prospect),
      language,
      milestone,
      interviewType
    },
    aiBriefLines: buildAiBriefLines(mission, workflowState),
    expandedBrief: buildExpandedBrief(mission, workflowState),
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
