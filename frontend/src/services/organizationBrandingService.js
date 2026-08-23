import { apiFetch } from "./apiClient";

export async function fetchOrganizationBranding(options = {}) {
  try {
    return await apiFetch("/api/organization/branding", options);
  } catch {
    return null;
  }
}
