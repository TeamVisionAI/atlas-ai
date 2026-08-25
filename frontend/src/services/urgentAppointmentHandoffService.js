import { apiFetch } from "./apiClient";

export async function fetchUrgentAppointmentHandoffs(options = {}) {
  return apiFetch("/api/appointments/urgent-handoffs", options);
}

export async function acknowledgeUrgentAppointmentHandoff(handoffId) {
  return apiFetch(`/api/appointments/urgent-handoffs/${encodeURIComponent(handoffId)}/acknowledge`, {
    method: "POST"
  });
}
