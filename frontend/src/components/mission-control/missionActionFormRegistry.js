import { isWhatsAppCopyAction } from "../../services/whatsappCommunicationService";
import { isPanelCommunicationAction } from "../../engines/communicationActionEngine";

export const INLINE_FORM_TYPES = {
  SCHEDULING: "scheduling",
  INTERVIEW_OUTCOME: "interview_outcome",
  QUALIFICATION: "qualification",
  CLOSE_NOT_INTERESTED: "close_not_interested"
};

const SCHEDULING_ACTIONS = new Set(["schedule", "reschedule"]);

const INTERVIEW_OUTCOME_ACTIONS = new Set([
  "enter_interview_outcome",
  "record_outcome",
  "record-outcome",
  "record interview outcome"
]);

const INTERVIEW_OUTCOME_MISSION_TYPES = new Set([
  "EnterInterviewOutcome",
  "UpdateOutcome"
]);

const PRE_INTERVIEW_CLOSE_MISSION_TYPES = new Set([
  "CompleteQualification",
  "CallProspect",
  "ReviewProspect",
  "ScheduleInterview"
]);

export function normalizeMissionActionId(actionId, mission) {
  const normalized = String(actionId || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (
    INTERVIEW_OUTCOME_ACTIONS.has(normalized) ||
    normalized.includes("interview_outcome") ||
    normalized.includes("record_outcome")
  ) {
    return "enter_interview_outcome";
  }

  if (
    mission?.missionType &&
    INTERVIEW_OUTCOME_MISSION_TYPES.has(mission.missionType) &&
    actionId === mission?.primaryAction?.id
  ) {
    return "enter_interview_outcome";
  }

  return actionId;
}

export function resolvesToInlineForm(actionId, mission = null) {
  const normalizedId = normalizeMissionActionId(actionId, mission);

  if (!normalizedId) {
    return null;
  }

  if (SCHEDULING_ACTIONS.has(normalizedId)) {
    return INLINE_FORM_TYPES.SCHEDULING;
  }

  if (normalizedId === "enter_interview_outcome") {
    return INLINE_FORM_TYPES.INTERVIEW_OUTCOME;
  }

  if (normalizedId === "qualification") {
    return INLINE_FORM_TYPES.QUALIFICATION;
  }

  if (normalizedId === "close_not_interested") {
    return INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED;
  }

  if (
    mission?.missionType === "CompleteQualification" &&
    normalizedId === mission?.primaryAction?.id &&
    normalizedId !== "whatsapp" &&
    normalizedId !== "notes" &&
    normalizedId !== "call" &&
    normalizedId !== "close_not_interested"
  ) {
    return INLINE_FORM_TYPES.QUALIFICATION;
  }

  return null;
}

export function isImmediateMissionAction(actionId) {
  return isWhatsAppCopyAction(actionId);
}

function shouldExposeQualificationAction(_mission, conversationOutcome) {
  return (conversationOutcome?.requiredInputs || []).length > 0;
}

function shouldExposePreInterviewClose(mission, conversationOutcome, workflowGate) {
  if (workflowGate?.active) {
    return false;
  }

  if (INTERVIEW_OUTCOME_MISSION_TYPES.has(mission?.missionType)) {
    return false;
  }

  if (conversationOutcome?.recordedOutcome) {
    const label = String(
      conversationOutcome.recordedOutcome.label || conversationOutcome.recordedOutcome.key || ""
    ).toLowerCase();

    if (label.includes("not interested")) {
      return false;
    }
  }

  if ((conversationOutcome?.requiredInputs || []).length > 0) {
    return true;
  }

  if (PRE_INTERVIEW_CLOSE_MISSION_TYPES.has(mission?.missionType)) {
    return true;
  }

  return mission?.workflowState?.canonicalMilestone === "QUALIFICATION";
}

/**
 * Builds the mission action list, injecting qualification + pre-interview close when needed.
 * Implements BR-025 / BR-026 / BR-044 terminal Not Interested for QUALIFYING.
 */
export function buildMissionActionList(mission, conversationOutcome, translate, workflowGate = null) {
  const actions = [];
  const seen = new Set();

  function addAction(action) {
    if (!action?.id || seen.has(action.id)) {
      return;
    }

    seen.add(action.id);
    actions.push(action);
  }

  const exposeQualification = shouldExposeQualificationAction(mission, conversationOutcome);

  if (exposeQualification) {
    addAction({
      id: "qualification",
      label: translate("missionActionQualification")
    });
  }

  if (shouldExposePreInterviewClose(mission, conversationOutcome, workflowGate)) {
    addAction({
      id: "close_not_interested",
      label: translate("missionActionCloseNotInterested")
    });
  }

  if (mission?.primaryAction?.id) {
    addAction(mission.primaryAction);
  }

  for (const action of mission?.secondaryActions || []) {
    addAction(action);
  }

  return actions.filter((action) => {
    if (
      action.id === "notes" ||
      action.id === "call" ||
      isPanelCommunicationAction(action.id)
    ) {
      return false;
    }

    if (action.id === "qualification") {
      return exposeQualification;
    }

    if (action.id === "close_not_interested") {
      return true;
    }

    return true;
  });
}
