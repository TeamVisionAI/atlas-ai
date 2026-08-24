import { apiFetch } from "./apiClient";

export async function getIulFollowUpWorklist({ filter, owner, campaign, nearExpiry } = {}) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (owner) params.set("owner", owner);
  if (campaign) params.set("campaign", campaign);
  if (nearExpiry) params.set("nearExpiry", "1");
  const query = params.toString();
  const path = query ? `/api/iul-follow-up-worklist?${query}` : "/api/iul-follow-up-worklist";
  return apiFetch(path);
}
