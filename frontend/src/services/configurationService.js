import { apiFetch } from "./apiClient";

export async function fetchConfigurationProfile() {
  return apiFetch("/api/configuration/profile");
}

export async function updateConfigurationProfile(payload) {
  return apiFetch("/api/configuration/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchOrganizationConfiguration() {
  return apiFetch("/api/configuration/organization");
}

export async function updateOrganizationConfiguration(payload) {
  return apiFetch("/api/configuration/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchOrganizationLevels() {
  return apiFetch("/api/configuration/organization/levels");
}

export async function fetchWhatsAppConfiguration() {
  return apiFetch("/api/configuration/whatsapp");
}

export async function fetchSchedulingConfiguration() {
  return apiFetch("/api/configuration/scheduling");
}

export async function updateSchedulingConfiguration(payload) {
  return apiFetch("/api/configuration/scheduling", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchGoogleCalendarAuthUrl(returnPath = "settings/scheduling") {
  const query = new URLSearchParams({ returnPath });
  return apiFetch(`/api/configuration/scheduling/google/auth-url?${query.toString()}`);
}

export async function fetchGoogleCalendars() {
  return apiFetch("/api/configuration/scheduling/google/calendars");
}

export async function selectGoogleCalendar(calendarId) {
  return apiFetch("/api/configuration/scheduling/google/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarId })
  });
}

export async function disconnectGoogleCalendar() {
  return apiFetch("/api/configuration/scheduling/google/disconnect", {
    method: "POST"
  });
}

export async function fetchOrganizationIntegrations() {
  return apiFetch("/api/configuration/organization/integrations");
}

export async function fetchMeetingManagement() {
  return apiFetch("/api/configuration/organization/meeting-management");
}

export async function updateMeetingManagement(payload) {
  return apiFetch("/api/configuration/organization/meeting-management", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
