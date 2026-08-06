/**
 * Communication Action Center presentation — ordered cards without mandatory sequence.
 * UX only; availability rules remain in communicationActionStateEngine.
 */

import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";

export const COMMUNICATION_ACTION_CENTER_CHROME = Object.freeze({
  CALL: "call",
  ADD_NOTE: "add_note"
});

/** Default card order for the Communication Action Center (Sprint 12.3.3). */
export const COMMUNICATION_ACTION_CENTER_ORDER = Object.freeze([
  COMMUNICATION_ACTION_CENTER_CHROME.CALL,
  COMMUNICATION_ACTION_IDS.CUSTOM,
  COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
  COMMUNICATION_ACTION_IDS.SEND_OFFICE,
  COMMUNICATION_ACTION_IDS.SEND_ZOOM,
  COMMUNICATION_ACTION_IDS.SEND_REMINDER,
  COMMUNICATION_ACTION_CENTER_CHROME.ADD_NOTE
]);

/**
 * Prospect Workspace Communication section — general prospect actions only.
 * Appointment-specific sends live in the Interview module.
 */
export const WORKSPACE_GENERAL_COMMUNICATION_ORDER = Object.freeze([
  COMMUNICATION_ACTION_CENTER_CHROME.CALL,
  COMMUNICATION_ACTION_IDS.CUSTOM,
  COMMUNICATION_ACTION_CENTER_CHROME.ADD_NOTE
]);

/** Appointment communication actions rendered inside the Interview module. */
export const INTERVIEW_MODULE_COMMUNICATION_ORDER = Object.freeze([
  COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
  COMMUNICATION_ACTION_IDS.SEND_OFFICE,
  COMMUNICATION_ACTION_IDS.SEND_ZOOM,
  COMMUNICATION_ACTION_IDS.SEND_REMINDER
]);

const CHROME_ICONS = Object.freeze({
  [COMMUNICATION_ACTION_CENTER_CHROME.CALL]: "📞",
  [COMMUNICATION_ACTION_CENTER_CHROME.ADD_NOTE]: "📝"
});

export function buildCommunicationActionCenterCards({
  phone,
  actions = [],
  translate,
  includeAddNote = false,
  recommendedActionId = null,
  order = COMMUNICATION_ACTION_CENTER_ORDER
}) {
  const actionById = new Map(actions.map((action) => [action.id, action]));
  const cards = [];

  for (const cardId of order) {
    if (cardId === COMMUNICATION_ACTION_CENTER_CHROME.CALL) {
      if (!phone) {
        continue;
      }

      cards.push({
        id: cardId,
        icon: CHROME_ICONS[cardId],
        title: translate?.("missionControlActionCall") || "Call Prospect",
        subtitle: translate?.("missionControlActionCallSubtitle") || phone,
        variant: "primary",
        enabled: true,
        recommended: recommendedActionId === cardId
      });
      continue;
    }

    if (cardId === COMMUNICATION_ACTION_CENTER_CHROME.ADD_NOTE) {
      if (!includeAddNote) {
        continue;
      }

      cards.push({
        id: cardId,
        icon: CHROME_ICONS[cardId],
        title: translate?.("workspaceActivityAddNoteLabel") || "Add Note",
        subtitle: translate?.("missionControlActionNotesSubtitle") || "",
        variant: "default",
        enabled: true,
        recommended: recommendedActionId === cardId
      });
      continue;
    }

    const action = actionById.get(cardId);

    if (!action || action.enabled === false) {
      continue;
    }

    cards.push({
      id: action.id,
      icon: action.icon,
      title: action.title,
      subtitle: action.subtitle || "",
      variant: action.variant || "default",
      enabled: true,
      recommended: recommendedActionId === action.id
    });
  }

  return cards;
}
