import { apiFetch } from "./apiClient";

export async function fetchOrganizationBranding() {
  try {
    return await apiFetch("/api/organization/branding");
  } catch {
    return null;
  }
}
