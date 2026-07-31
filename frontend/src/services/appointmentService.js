import { apiFetch } from "./apiClient";
import {
  copyMessageToClipboard,
  openWhatsAppConversation
} from "./whatsappCommunicationService";

/** Normalizes appointment API payloads to a plain array. */
export function normalizeAppointmentList(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray(result.items)) {
    return result.items;
  }

  if (result && Array.isArray(result.list)) {
    return result.list;
  }

  if (result && Array.isArray(result.upcoming)) {
    return result.upcoming;
  }

  return [];
}

export function getAppointmentIdentityKey(appointment = {}) {
  return `${appointment.prospectPhone}:${appointment.startDateTime}`;
}

const ACTIVE_APPOINTMENT_STATUSES = new Set([
  "scheduled",
  "confirmed",
  "rescheduled",
  "pending_confirmation",
  "in_progress",
  "human_assist_required"
]);

const TERMINAL_APPOINTMENT_LIFECYCLE_STATES = new Set([
  "completed",
  "cancelled",
  "recruited",
  "became_client",
  "no_show"
]);

export function isActiveAppointment(appointment = {}) {
  const lifecycleState = appointment.metadata?.lifecycleState;

  if (lifecycleState && TERMINAL_APPOINTMENT_LIFECYCLE_STATES.has(lifecycleState)) {
    return false;
  }

  return ACTIVE_APPOINTMENT_STATUSES.has(appointment.status);
}

export function isCompletedAppointment(appointment = {}) {
  const lifecycleState = appointment.metadata?.lifecycleState;

  if (lifecycleState === "recruited" || lifecycleState === "became_client") {
    return true;
  }

  return appointment.status === "completed" || appointment.status === "no_show";
}

export function appointmentMatchesView(appointment, view) {
  switch (view) {
    case "today":
    case "upcoming":
    case "pending_confirmation":
    case "human_assist":
      return isActiveAppointment(appointment);
    case "completed":
      return isCompletedAppointment(appointment);
    case "cancelled":
      return appointment.status === "cancelled" || appointment.metadata?.lifecycleState === "cancelled";
    default:
      return true;
  }
}

export async function fetchAppointmentProfile() {
  return apiFetch("/api/appointments/profile");
}

export async function updateAppointmentProfile(payload) {
  return apiFetch("/api/appointments/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchAppointmentAvailability(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/api/appointments/availability${suffix}`);
}

export async function fetchAppointments(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/api/appointments${suffix}`);
}

export async function fetchAppointment(id) {
  return apiFetch(`/api/appointments/${id}`);
}

export async function createAppointment(payload) {
  return apiFetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function rescheduleAppointment(id, payload) {
  return apiFetch(`/api/appointments/${id}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function cancelAppointment(id, payload) {
  return apiFetch(`/api/appointments/${id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function completeAppointment(id, payload) {
  return apiFetch(`/api/appointments/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function requestAppointmentHumanAssist(id, payload) {
  return apiFetch(`/api/appointments/${id}/human-assist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function resolveAppointmentHumanAssist(id, payload) {
  return apiFetch(`/api/appointments/${id}/resolve-human-assist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function collectProspectEmail(phone, email) {
  return apiFetch(`/api/appointments/prospect/${encodeURIComponent(phone)}/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
}

export async function sendInterviewDetails(appointmentId) {
  return apiFetch(`/api/appointments/${encodeURIComponent(appointmentId)}/send-interview-details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export async function executeSendInterviewDetails({
  appointmentId,
  translate,
  showSuccess,
  showError,
  onOrganizationResourceMissing,
  onRecorded
}) {
  if (!appointmentId) {
    showError?.(translate("missionControlActionFailed"));
    return { success: false };
  }

  let result;

  try {
    result = await sendInterviewDetails(appointmentId);
  } catch (error) {
    showError?.(translate("missionControlActionFailed"));
    return { success: false, message: error.message };
  }

  if (!result?.success) {
    if (result?.error === "MEETING_URL_NOT_CONFIGURED" && result?.resourceKey) {
      onOrganizationResourceMissing?.(result.resourceKey);
    }

    showError?.(result?.message || translate("missionControlActionFailed"));
    return { success: false, message: result?.message };
  }

  try {
    await copyMessageToClipboard(result.message);
  } catch {
    showError?.(translate("whatsappCopyOpenClipboardError"));
    return { success: false };
  }

  openWhatsAppConversation({ phone: result.phone, message: result.message });
  showSuccess?.(translate(result.toastKey || "whatsappCopyOpenConfirmation"));
  await onRecorded?.(result);

  return { success: true, ...result };
}
