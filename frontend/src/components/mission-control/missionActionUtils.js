import {
  getActionPresentation,
  resolveActionVariant
} from "../../engines/actionPresentation";

import { PANEL_COMMUNICATION_ACTION_IDS } from "../../engines/communicationActionEngine";

/** Permanent actions shown outside the dynamic mission action list. */
export const PERMANENT_MISSION_ACTION_IDS = new Set(["notes"]);

/** Actions excluded from the dynamic mission workflow list. */
export const EXCLUDED_WORKFLOW_ACTION_IDS = new Set([
  "notes",
  "call",
  ...PANEL_COMMUNICATION_ACTION_IDS
]);

export function isPermanentMissionAction(actionId) {
  return PERMANENT_MISSION_ACTION_IDS.has(actionId);
}

export function isWorkflowMissionAction(actionId) {
  return actionId && !EXCLUDED_WORKFLOW_ACTION_IDS.has(actionId);
}

/**
 * Primary + secondary mission actions that belong in the Mission Actions section.
 */
export function collectWorkflowMissionActions(mission) {
  if (!mission) {
    return [];
  }

  const actions = [];
  const seen = new Set();

  function addAction(action) {
    if (!action?.id || seen.has(action.id) || !isWorkflowMissionAction(action.id)) {
      return;
    }

    seen.add(action.id);
    actions.push(action);
  }

  addAction(mission.primaryAction);

  for (const action of mission.secondaryActions || []) {
    addAction(action);
  }

  return actions;
}

export function buildMissionActionCard(action, { translate, phone, variantOverride, featured = false, onClick }) {
  const presentation = getActionPresentation(action.id);
  const subtitle =
    action.id === "call"
      ? phone || translate("missionControlActionCallSubtitle")
      : presentation?.subtitleKey
        ? translate(presentation.subtitleKey)
        : "";

  return {
    id: action.id,
    icon: presentation?.icon || "•",
    title: action.label || (presentation?.titleKey ? translate(presentation.titleKey) : action.id),
    subtitle,
    variant: variantOverride || resolveActionVariant(action.id, featured ? "primary" : "secondary"),
    featured,
    onClick
  };
}
