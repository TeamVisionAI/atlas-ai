/**
 * Reusable WhatsApp communication action engine — execution adapters.
 * Availability rules live in communicationActionStateEngine.js (Sprint 12.2.y).
 */

import { executeSendViaWhatsApp } from "../services/whatsappCommunicationService";
import { executeZoomInvitationAction } from "../services/communicationActionService";
import { executeSendInterviewDetails } from "../services/appointmentService";

export {
  COMMUNICATION_ACTION_IDS,
  PANEL_COMMUNICATION_ACTION_IDS,
  COMMUNICATION_PANEL_ACTION_ORDER,
  orderCommunicationPanelActions,
  resolveCommunicationActions,
  isPanelCommunicationAction,
  filterPanelCommunicationActions,
  buildCommunicationActionCard,
  isInterviewConfirmed
} from "./communicationActionStateEngine.js";

/** One-click execution: channel-aware for Zoom; WhatsApp copy+open for other actions. */
export function executeCommunicationAction(options) {
  if (options.actionId === "resend_interview_details") {
    return executeSendInterviewDetails({
      appointmentId: options.appointmentId,
      translate: options.translate,
      showSuccess: options.showSuccess,
      showError: options.showError,
      onOrganizationResourceMissing: options.onOrganizationResourceMissing,
      onRecorded: options.onRecorded
    });
  }

  if (options.actionId === "send_zoom_link") {
    return executeZoomInvitationAction({
      phone: options.phone,
      translate: options.translate,
      showSuccess: options.showSuccess,
      showError: options.showError,
      showInfo: options.showInfo,
      onOrganizationResourceMissing: options.onOrganizationResourceMissing,
      onRecorded: options.onRecorded,
      forceWhatsApp: options.forceWhatsApp,
      onWhatsAppFallbackOffer: options.onWhatsAppFallbackOffer
    });
  }

  return executeSendViaWhatsApp(options);
}
