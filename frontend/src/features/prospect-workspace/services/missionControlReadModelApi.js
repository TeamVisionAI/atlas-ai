/**
 * Sprint 15.2 — Mission Control projection read API (reuse Sprint 15.0 routes).
 */

import { getAuthHeaders } from "../../../services/atlasAuthService";
import { apiRequest } from "../../../services/apiClient";

export class MissionControlReadModelError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "MissionControlReadModelError";
    this.status = status;
  }
}

async function readMissionControl(path) {
  const headers = await getAuthHeaders();
  const response = await apiRequest(path, { headers });

  if (!response.ok) {
    throw new MissionControlReadModelError("Failed to load Mission Control read model.", response.status);
  }

  return response.json();
}

export function getMissionControlSummary(organizationId) {
  const params = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  return readMissionControl(`/api/mission-control/summary${params}`);
}

export function getMissionControlMetrics(organizationId) {
  const params = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  return readMissionControl(`/api/mission-control/metrics${params}`);
}
