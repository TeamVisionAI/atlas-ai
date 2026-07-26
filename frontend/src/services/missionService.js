import { apiFetch } from "./apiClient";

export async function fetchMissions(params = {}) {
  const query = new URLSearchParams();

  if (params.prospectPhone) {
    query.set("prospectPhone", params.prospectPhone);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/api/missions${suffix}`);
}

export async function fetchProspectMissions(phone) {
  return apiFetch(`/api/missions/prospect/${encodeURIComponent(phone)}`);
}

export async function fetchMission(missionId) {
  return apiFetch(`/api/missions/${encodeURIComponent(missionId)}`);
}

export async function recalculateMissions(payload = {}) {
  return apiFetch("/api/missions/recalculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
