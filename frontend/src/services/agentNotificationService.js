import { apiFetch } from "./apiClient";

export async function listAgentNotifications() {
  return apiFetch("/api/organization/notifications");
}

export async function getAgentNotificationUnreadCount() {
  return apiFetch("/api/organization/notifications/unread-count");
}

export async function markAgentNotificationRead(id) {
  return apiFetch(`/api/organization/notifications/${id}/read`, {
    method: "POST"
  });
}

export async function markAllAgentNotificationsRead() {
  return apiFetch("/api/organization/notifications/read-all", {
    method: "POST"
  });
}

export async function getAgentNotificationPreferences() {
  return apiFetch("/api/organization/notifications/preferences");
}

export async function updateAgentNotificationPreferences(patch) {
  return apiFetch("/api/organization/notifications/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}
