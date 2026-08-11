import { isWhatsAppCopyAction } from "../../services/whatsappCommunicationService";
import { isPanelCommunicationAction } from "../../engines/communicationActionEngine";
import {
  INLINE_FORM_TYPES,
  INLINE_FORM_BY_ACTION_ID,
  normalizeMissionActionId,
  resolvesToInlineForm,
  isCloseNotInterestedForm,
  isRenderableInlineFormType
} from "./missionActionInlineFormResolver";

export {
  INLINE_FORM_TYPES,
  INLINE_FORM_BY_ACTION_ID,
  normalizeMissionActionId,
  resolvesToInlineForm,
  isCloseNotInterestedForm,
  isRenderableInlineFormType
};

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
