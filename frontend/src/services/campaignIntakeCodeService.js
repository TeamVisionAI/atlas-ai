import { apiFetch } from "./apiClient";

export async function fetchCampaignIntakeCodes() {
  return apiFetch("/api/campaign-intake-codes");
}

export async function createCampaignIntakeCode(payload) {
  return apiFetch("/api/campaign-intake-codes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function pauseCampaignIntakeCode(id) {
  return apiFetch(`/api/campaign-intake-codes/${id}/pause`, { method: "POST" });
}

export async function reactivateCampaignIntakeCode(id) {
  return apiFetch(`/api/campaign-intake-codes/${id}/reactivate`, { method: "POST" });
}

export async function retireCampaignIntakeCode(id) {
  return apiFetch(`/api/campaign-intake-codes/${id}/retire`, { method: "POST" });
}
