/**
 * Appointment communication routing — maps panel actions to preview/send purposes.
 */

import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";

export const APPOINTMENT_COMMUNICATION_PURPOSES = Object.freeze({
  INVITATION: "invitation",
  REMINDER: "reminder",
  ZOOM: "zoom",
  OFFICE: "office"
});

const ACTION_TO_PURPOSE = Object.freeze({
  [COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS]: APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION,
  [COMMUNICATION_ACTION_IDS.SEND_REMINDER]: APPOINTMENT_COMMUNICATION_PURPOSES.REMINDER,
  [COMMUNICATION_ACTION_IDS.SEND_ZOOM]: APPOINTMENT_COMMUNICATION_PURPOSES.ZOOM,
  [COMMUNICATION_ACTION_IDS.SEND_OFFICE]: APPOINTMENT_COMMUNICATION_PURPOSES.OFFICE
});

export function resolveAppointmentCommunicationPurpose(actionId) {
  return ACTION_TO_PURPOSE[actionId] || null;
}

export function isAppointmentCommunicationAction(actionId) {
  return Boolean(resolveAppointmentCommunicationPurpose(actionId));
}
