import { isWhatsAppCopyAction } from "../../services/whatsappCommunicationService";
import { isPanelCommunicationAction } from "../../engines/communicationActionEngine";

export const INLINE_FORM_TYPES = {
  SCHEDULING: "scheduling",
  INTERVIEW_OUTCOME: "interview_outcome",
  QUALIFICATION: "qualification"
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

  if (
    mission?.missionType === "CompleteQualification" &&
    normalizedId === mission?.primaryAction?.id &&
    normalizedId !== "whatsapp" &&
    normalizedId !== "notes" &&
    normalizedId !== "call"
  ) {
    return null;
  }

  return null;
}

export function isImmediateMissionAction(actionId) {
  return isWhatsAppCopyAction(actionId);
}

/**
 * Builds the mission action list, injecting qualification when required fields remain.
 */
export function buildMissionActionList(mission, conversationOutcome, translate) {
  const actions = [];
  const seen = new Set();

  function addAction(action) {
    if (!action?.id || seen.has(action.id)) {
      return;
    }

    seen.add(action.id);
    actions.push(action);
  }

  const requiredInputs = conversationOutcome?.requiredInputs || [];

  if (requiredInputs.length > 0) {
    addAction({
      id: "qualification",
      label: translate("missionActionQualification")
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
      return requiredInputs.length > 0;
    }

    return true;
  });
}
