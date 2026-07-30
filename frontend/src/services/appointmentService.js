import { apiFetch } from "./apiClient";

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
