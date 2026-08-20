import { apiFetch } from "./apiClient";

export async function fetchRecruitingConfig() {
  return apiFetch("/api/organization/recruiting-config");
}

export async function updateRecruitingConfig(patch) {
  return apiFetch("/api/organization/recruiting-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}
