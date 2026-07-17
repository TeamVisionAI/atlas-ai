import { MILESTONES } from "../types/milestones";
import { normalizeProspectLanguage } from "../types/language";
import { formatTextWithDates } from "../utils/dateFormatter";

/**
 * Presentation-only label map from backend engine step to agent milestone copy.
 * Business decisions remain in backend engines.
 */
export function mapStepToMilestoneLabel(currentStep, missingFields = []) {
  if (currentStep === "CONFIRMED") {
    return MILESTONES.INTERVIEW_CONFIRMED;
  }

  if (missingFields.includes("schedule") || currentStep === "SCHEDULE") {
    return MILESTONES.INTERVIEW_SCHEDULED;
  }

  if (missingFields.length) {
    return MILESTONES.QUALIFYING;
  }

  return MILESTONES.NEW_LEAD;
}

export function normalizeInterviewTypeDisplay(value) {
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

export function formatProspectLocation(city, state) {
  if (!city) {
    return "—";
  }

  return state ? `${city}, ${state}` : city;
}

function normalizeSummaryLines(summary) {
  if (!summary) {
    return [];
  }

  const lines = Array.isArray(summary) ? summary : [summary];

  return lines
    .filter(Boolean)
    .map((line) => formatTextWithDates(String(line)))
    .slice(0, 5);
}

/**
 * Converts Mission Control API payload + optional dashboard row into UI workspace model.
 * Normalization only — no business-rule decisions.
 *
 * @param {import("../types/missionControl").MissionControlResponse} missionControl
 * @param {Object | null} [dashboardProspect]
 * @param {{ isLive?: boolean }} [options]
 * @returns {import("../types/missionControl").AgentWorkspaceModel}
 */
export function adaptMissionControlResponse(
  missionControl,
  dashboardProspect = null,
  options = {}
) {
  const { prospect, brain, businessRules, atlasBrief } = missionControl;
  const missingFields = brain?.missingFields || [];
  const milestone = mapStepToMilestoneLabel(brain?.currentStep, missingFields);
  const interviewType = normalizeInterviewTypeDisplay(
    brain?.interviewType || businessRules?.interviewType
  );
  const language = normalizeProspectLanguage(brain?.language);
  const summaryLines = normalizeSummaryLines(atlasBrief?.summary);
  const aiBriefLines = summaryLines.length
    ? summaryLines
    : ["Brief not yet available."];

  return {
    phone: prospect?.phone || "",
    isLive: options.isLive !== false,
    prospect: {
      name: prospect?.name || "—",
      phone: prospect?.phone || "—",
      location: formatProspectLocation(prospect?.city, prospect?.state),
      language,
      milestone,
      interviewType
    },
    brain: {
      language: brain?.language || "en",
      intent: brain?.intent || "UNKNOWN",
      currentStep: brain?.currentStep || "NEW",
      interviewType: brain?.interviewType || null,
      missingFields
    },
    businessRules: {
      localProspect: Boolean(businessRules?.localProspect),
      interviewType: businessRules?.interviewType || null,
      workAuthorization: businessRules?.workAuthorization ?? null,
      emailRequired: Boolean(businessRules?.emailRequired)
    },
    aiBriefLines,
    expandedBrief: {
      summary: summaryLines,
      suggestedReply: missionControl.suggestedReply || null,
      importantNotes: missionControl.importantNotes || [],
      objections: missionControl.objections || [],
      aiRecommendation: missionControl.aiRecommendation || null
    },
    conversation: {
      lastMessage: dashboardProspect?.last_message || null,
      interviewTime: dashboardProspect?.interview_time || null,
      appointmentDate: dashboardProspect?.appointment_date || null
    },
    availableActions: missionControl.availableActions || [],
    raw: missionControl
  };
}

function buildMockAvailableActions(queueProspect, interviewType) {
  const step = queueProspect.current_step || "GREETING";
  const normalizedType = normalizeInterviewTypeDisplay(interviewType);
  const actions = [
    { id: "whatsapp", priority: "primary" },
    { id: "call", priority: "secondary" },
    { id: "notes", priority: "secondary" }
  ];

  if (step === "SCHEDULE") {
    actions.unshift({ id: "schedule", priority: "primary" });
  }

  if (step === "CONFIRMED") {
    if (normalizedType === "Zoom") {
      actions.unshift({ id: "send_zoom_link", priority: "primary" });
    }

    if (normalizedType === "Office") {
      actions.unshift({ id: "send_office_location", priority: "primary" });
    }

    actions.push({ id: "reschedule", priority: "secondary" });
  }

  const primary = actions.filter((action) => action.priority === "primary");
  const secondary = actions.filter((action) => action.priority !== "primary");

  return [...primary, ...secondary].slice(0, 5);
}

/**
 * @param {Object} queueProspect
 * @returns {import("../types/missionControl").MissionControlResponse}
 */
export function buildMockMissionControlFromQueueProspect(queueProspect) {
  const interviewType =
    queueProspect.interview_type ||
    (queueProspect.city === "Doral" ? "In Person" : "Zoom");

  return {
    prospect: {
      name: queueProspect.name,
      phone: queueProspect.phone,
      city: queueProspect.city || null,
      state: queueProspect.state || null,
      occupation: queueProspect.occupation || null
    },
    brain: {
      language: "en",
      intent: "UNKNOWN",
      currentStep: queueProspect.current_step || "GREETING",
      interviewType,
      missingFields: queueProspect.current_step === "SCHEDULE" ? ["schedule"] : []
    },
    businessRules: {
      localProspect: queueProspect.city === "Doral",
      interviewType,
      workAuthorization: true,
      emailRequired: interviewType === "Zoom"
    },
    atlasBrief: {
      summary: [
        queueProspect.city
          ? `Prospect from ${queueProspect.state ? `${queueProspect.city}, ${queueProspect.state}` : queueProspect.city}`
          : "New prospect in queue"
      ]
    },
    availableActions: buildMockAvailableActions(queueProspect, interviewType)
  };
}
