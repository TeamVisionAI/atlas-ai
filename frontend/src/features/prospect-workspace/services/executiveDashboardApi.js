/**
 * Sprint 15.2 — Executive Dashboard projection read API (reuse Sprint 15.1 routes).
 */

import { getAuthHeaders } from "../../../services/atlasAuthService";
import { apiRequest } from "../../../services/apiClient";

export class ExecutiveDashboardReadModelError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ExecutiveDashboardReadModelError";
    this.status = status;
  }
}

async function readExecutiveDashboard(path) {
  const headers = await getAuthHeaders();
  const response = await apiRequest(path, { headers });

  if (!response.ok) {
    throw new ExecutiveDashboardReadModelError(
      "Failed to load Executive Dashboard read model.",
      response.status
    );
  }

  return response.json();
}

export function getExecutiveDashboardSummary(organizationId) {
  const params = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  return readExecutiveDashboard(`/api/executive-dashboard/summary${params}`);
}

export function getExecutiveDashboardKpis(organizationId) {
  const params = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  return readExecutiveDashboard(`/api/executive-dashboard/kpis${params}`);
}

export function getExecutiveDashboardTrends(organizationId) {
  const params = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  return readExecutiveDashboard(`/api/executive-dashboard/trends${params}`);
}
