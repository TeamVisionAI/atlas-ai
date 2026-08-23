import { apiFetch } from "./apiClient";

export async function getDashboard(options = {}) {
  return apiFetch("/api/dashboard", options);
}
