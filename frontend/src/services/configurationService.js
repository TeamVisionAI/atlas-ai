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

export async function fetchGoogleCalendarAuthUrl(
  returnPath = "settings/integrations",
  { ownershipMode = "personal" } = {}
) {
  const query = new URLSearchParams({ returnPath, ownershipMode });
  return apiFetch(`/api/configuration/scheduling/google/auth-url?${query.toString()}`);
}

export async function fetchGoogleCalendars({ ownershipMode = "personal" } = {}) {
  const query = new URLSearchParams({ ownershipMode });
  return apiFetch(`/api/configuration/scheduling/google/calendars?${query.toString()}`);
}

export async function selectGoogleCalendar(calendarId, { ownershipMode = "personal" } = {}) {
  return apiFetch("/api/configuration/scheduling/google/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarId, ownershipMode })
  });
}

export async function disconnectGoogleCalendar({ ownershipMode = "personal" } = {}) {
  return apiFetch("/api/configuration/scheduling/google/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownershipMode })
  });
}

export async function connectIcloudCalendar({ appleAccountEmail, appSpecificPassword }) {
  return apiFetch("/api/configuration/scheduling/icloud/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appleAccountEmail, appSpecificPassword })
  });
}

export async function fetchIcloudCalendars() {
  return apiFetch("/api/configuration/scheduling/icloud/calendars");
}

export async function selectIcloudCalendar(calendarHref, calendarDisplayName) {
  return apiFetch("/api/configuration/scheduling/icloud/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarHref, calendarDisplayName })
  });
}

export async function disconnectIcloudCalendar() {
  return apiFetch("/api/configuration/scheduling/icloud/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
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
