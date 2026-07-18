/**
 * @returns {Promise<import("../types/organization").OrganizationSettings>}
 */
export async function getOrganizationSettings() {
  const response = await fetch("/api/organization/settings");

  if (!response.ok) {
    throw new Error("Failed to load organization settings");
  }

  return response.json();
}
