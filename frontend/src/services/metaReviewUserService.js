import { apiFetch } from "./apiClient";

export async function listReviewUsers() {
  return apiFetch("/api/admin/review-users");
}

export async function createReviewUser(payload) {
  return apiFetch("/api/admin/review-users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function resetReviewUserPassword(userId, password) {
  return apiFetch(`/api/admin/review-users/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
}
