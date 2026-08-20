import { apiFetch } from "./apiClient";

export async function fetchOrganizationBilling() {
  return apiFetch("/api/organization/billing");
}
