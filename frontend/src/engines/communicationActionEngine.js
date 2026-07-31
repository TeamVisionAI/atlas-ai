/**
 * Reusable WhatsApp communication action engine — execution adapters.
 * Availability rules live in communicationActionStateEngine.js (Sprint 12.2.y).
 */

import { executeSendViaWhatsApp } from "../services/whatsappCommunicationService";
import { executeZoomInvitationAction } from "../services/communicationActionService";
import {
  executeSendInterviewDetails,
  executeSendInterviewReminder,
  executeSendZoomInvitation,
  executeSendOfficeLocation
} from "../services/appointmentService";
import {
  isAppointmentCommunicationAction,
  resolveAppointmentCommunicationPurpose
} from "./appointmentCommunicationEngine.js";

export {
  COMMUNICATION_ACTION_IDS,
  APPOINTMENT_COMMUNICATION_ACTION_IDS,
  PANEL_COMMUNICATION_ACTION_IDS,
  COMMUNICATION_PANEL_ACTION_ORDER,
  orderCommunicationPanelActions,
  resolveCommunicationActions,
  evaluateAppointmentCommunicationAvailability,
  buildCommunicationActionContext,
  isPanelCommunicationAction,
  filterPanelCommunicationActions,
  buildCommunicationActionCard,
  isInterviewConfirmed
} from "./communicationActionStateEngine.js";

export {
  APPOINTMENT_COMMUNICATION_PURPOSES,
  resolveAppointmentCommunicationPurpose
} from "./appointmentCommunicationEngine.js";

const APPOINTMENT_EXECUTORS = Object.freeze({
  resend_interview_details: executeSendInterviewDetails,
  send_interview_reminder: executeSendInterviewReminder,
  send_zoom_link: executeSendZoomInvitation,
  send_office_location: executeSendOfficeLocation
});

/** One-click execution for panel actions. Appointment communications require appointmentId. */
export function executeCommunicationAction(options) {
  const appointmentExecutor = APPOINTMENT_EXECUTORS[options.actionId];

  if (appointmentExecutor) {
    return appointmentExecutor({
      appointmentId: options.appointmentId,
      translate: options.translate,
      showSuccess: options.showSuccess,
      showError: options.showError,
      onOrganizationResourceMissing: options.onOrganizationResourceMissing,
      onRecorded: options.onRecorded
    });
  }

  if (options.actionId === "send_zoom_link" && options.forceWhatsApp) {
    return executeZoomInvitationAction({
      phone: options.phone,
      translate: options.translate,
      showSuccess: options.showSuccess,
      showError: options.showError,
      showInfo: options.showInfo,
      onOrganizationResourceMissing: options.onOrganizationResourceMissing,
      onRecorded: options.onRecorded,
      forceWhatsApp: true,
      onWhatsAppFallbackOffer: options.onWhatsAppFallbackOffer
    });
  }

  return executeSendViaWhatsApp(options);
}

export function isAppointmentBasedCommunicationAction(actionId) {
  return isAppointmentCommunicationAction(actionId);
}
