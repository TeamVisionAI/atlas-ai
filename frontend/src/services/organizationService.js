import { apiFetch } from "./apiClient";

/**
 * @returns {Promise<import("../types/organization").OrganizationSettings>}
 */
export async function getOrganizationSettings() {
  return apiFetch("/api/organization/settings");
}
