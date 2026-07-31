import { apiFetch } from "./apiClient";
import { getWhatsAppCommunicationPreview } from "./missionControlService";
export {
  extractOutboundPayload,
  previewMessageMatchesSendPayload
} from "../engines/communicationPreviewEngine.js";

export async function fetchAppointmentCommunicationPreview(appointmentId) {
  return apiFetch(`/api/appointments/${encodeURIComponent(appointmentId)}/communication-preview`);
}

export async function fetchPhoneCommunicationPreview(phone, params = {}) {
  return getWhatsAppCommunicationPreview(phone, params);
}
