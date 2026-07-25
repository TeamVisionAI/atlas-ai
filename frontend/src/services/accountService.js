import { apiFetch } from "./apiClient";

export async function fetchAccountProfile() {
  return apiFetch("/api/account/profile");
}

export async function updateAccountProfile(payload) {
  return apiFetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function changeAccountPassword(currentPassword, newPassword) {
  return apiFetch("/api/account/password/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function fetchAccountSessions() {
  return apiFetch("/api/account/sessions");
}

export async function logoutAllSessions() {
  return apiFetch("/api/account/sessions/logout-all", { method: "POST" });
}

export async function logoutCurrentSession() {
  return apiFetch("/api/account/sessions/logout-current", { method: "POST" });
}
