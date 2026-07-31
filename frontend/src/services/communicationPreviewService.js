import { apiFetch } from "./apiClient";
import { getWhatsAppCommunicationPreview } from "./missionControlService";
import { resolvePersistedAppointmentId } from "../engines/appointmentIdEngine.js";
import { APPOINTMENT_COMMUNICATION_PURPOSES } from "../engines/appointmentCommunicationEngine.js";
export {
  extractOutboundPayload,
  previewMessageMatchesSendPayload
} from "../engines/communicationPreviewEngine.js";

const APPOINTMENT_PREVIEW_PATHS = Object.freeze({
  [APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION]: "communication-preview",
  [APPOINTMENT_COMMUNICATION_PURPOSES.REMINDER]: "interview-reminder-preview",
  [APPOINTMENT_COMMUNICATION_PURPOSES.ZOOM]: "zoom-invitation-preview",
  [APPOINTMENT_COMMUNICATION_PURPOSES.OFFICE]: "office-location-preview"
});

export async function fetchAppointmentCommunicationPreviewByPurpose(appointmentId, purpose) {
  const persistedId = resolvePersistedAppointmentId(appointmentId);
  const pathSegment = APPOINTMENT_PREVIEW_PATHS[purpose];

  if (!persistedId || !pathSegment) {
    return { success: false, message: "Appointment not found." };
  }

  return apiFetch(`/api/appointments/${encodeURIComponent(persistedId)}/${pathSegment}`);
}

export async function fetchAppointmentCommunicationPreview(appointmentId) {
  return fetchAppointmentCommunicationPreviewByPurpose(
    appointmentId,
    APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION
  );
}

export async function fetchAppointmentInterviewReminderPreview(appointmentId) {
  return fetchAppointmentCommunicationPreviewByPurpose(
    appointmentId,
    APPOINTMENT_COMMUNICATION_PURPOSES.REMINDER
  );
}

export async function fetchAppointmentZoomInvitationPreview(appointmentId) {
  return fetchAppointmentCommunicationPreviewByPurpose(
    appointmentId,
    APPOINTMENT_COMMUNICATION_PURPOSES.ZOOM
  );
}

export async function fetchAppointmentOfficeLocationPreview(appointmentId) {
  return fetchAppointmentCommunicationPreviewByPurpose(
    appointmentId,
    APPOINTMENT_COMMUNICATION_PURPOSES.OFFICE
  );
}

export async function fetchPhoneCommunicationPreview(phone, params = {}) {
  return getWhatsAppCommunicationPreview(phone, params);
}
