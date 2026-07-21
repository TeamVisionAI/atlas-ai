import { apiFetch } from "./apiClient";

export async function getDashboard() {
  return apiFetch("/api/dashboard");
}
