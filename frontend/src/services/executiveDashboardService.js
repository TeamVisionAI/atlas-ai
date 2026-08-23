import { apiFetch } from "./apiClient";

export async function getExecutiveDashboard(options = {}) {
  return apiFetch("/api/dashboard/executive", options);
}

export async function getExecutiveRecommendations(limit = 5) {
  return apiFetch(
    `/api/dashboard/recommendations?limit=${encodeURIComponent(limit)}`
  );
}

export async function getExecutiveActivity(limit = 20) {
  return apiFetch(
    `/api/dashboard/activity?limit=${encodeURIComponent(limit)}`
  );
}

export async function getAlphaMorningBrief(options = {}) {
  return apiFetch("/api/dashboard/alpha-brief", options);
}
