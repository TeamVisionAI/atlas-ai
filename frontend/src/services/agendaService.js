import { apiFetch } from "./apiClient";

export async function fetchTodayAgenda(options = {}) {
  return apiFetch("/api/agenda/today", { signal: options.signal });
}

export async function createAgendaAppointment(payload) {
  return apiFetch("/api/agenda/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function recordAgendaOutcome(appointmentId, payload) {
  return apiFetch(`/api/agenda/appointments/${encodeURIComponent(appointmentId)}/outcome`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
