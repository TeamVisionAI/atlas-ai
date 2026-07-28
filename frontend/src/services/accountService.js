import { apiFetch, apiRequest } from "./apiClient";

async function parseApiResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `API ${response.status}`);
  }

  return payload;
}

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

export async function uploadAccountPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await apiRequest("/api/account/photo", {
    method: "POST",
    body: formData
  });

  return parseApiResponse(response);
}

export async function removeAccountPhoto() {
  const response = await apiRequest("/api/account/photo", {
    method: "DELETE"
  });

  return parseApiResponse(response);
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
