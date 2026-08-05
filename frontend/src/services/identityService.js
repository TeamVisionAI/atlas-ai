import { apiFetch, apiRequest } from "./apiClient";
import { buildQueryString } from "../utils/queryString";

export async function listAdminUsers(params = {}) {
  return apiFetch(`/api/admin/users${buildQueryString(params)}`);
}

export async function createAdminUser(payload) {
  return apiFetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateAdminUser(userId, payload) {
  return apiFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function suspendAdminUser(userId) {
  return apiFetch(`/api/admin/users/${userId}/suspend`, { method: "POST" });
}

export async function reactivateAdminUser(userId) {
  return apiFetch(`/api/admin/users/${userId}/reactivate`, { method: "POST" });
}

export async function archiveAdminUser(userId) {
  return apiFetch(`/api/admin/users/${userId}/archive`, { method: "POST" });
}

export async function forcePasswordReset(userId) {
  return apiFetch(`/api/admin/users/${userId}/force-password-reset`, { method: "POST" });
}

export async function forceLogoutUser(userId) {
  return apiFetch(`/api/admin/users/${userId}/force-logout`, { method: "POST" });
}

export async function resendInvitation(userId) {
  return apiFetch(`/api/admin/users/${userId}/resend-invitation`, { method: "POST" });
}

export async function transferOwnership(fromUserId, toUserId) {
  return apiFetch(`/api/admin/users/${fromUserId}/transfer-ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toUserId })
  });
}

export async function getLoginHistory(userId) {
  return apiFetch(`/api/admin/users/${userId}/login-history`);
}

export async function getUserSecuritiesAuthorization(userId) {
  return apiFetch(`/api/admin/securities-access/users/${userId}`);
}

export async function updateUserSecuritiesAuthorization(userId, payload) {
  return apiFetch(`/api/admin/securities-access/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function revokeUserSecuritiesAuthorization(userId, reason) {
  return apiFetch(`/api/admin/securities-access/users/${userId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
}

export async function requestPasswordReset(email) {
  const response = await apiRequest("/api/auth/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  return response.json();
}

export async function confirmPasswordReset(token, newPassword) {
  const response = await apiRequest("/api/auth/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to reset password.");
  }

  return payload;
}

export async function validateInvitation(token) {
  const response = await apiRequest(
    `/api/auth/invitation/validate?token=${encodeURIComponent(token)}`
  );

  return response.json();
}

export async function acceptInvitation(token, password) {
  const response = await apiRequest("/api/auth/invitation/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to accept invitation.");
  }

  return payload;
}
