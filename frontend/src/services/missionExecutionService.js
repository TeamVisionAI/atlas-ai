import { apiRequest } from "./apiClient";
import { MissionControlError } from "./missionControlService";

/**
 * Sprint 21 — Mission execution client.
 * Mission Control → MissionExecutionService → backend orchestration.
 */

/**
 * @param {string} phone
 * @param {{ missionType: string, payload: Object }} body
 */
export async function executeMission(phone, body) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to execute mission", response.status);
  }

  return result;
}

/**
 * @param {string} phone
 * @param {Object} payload
 */
export async function executeScheduleInterview(phone, payload) {
  return executeMission(phone, {
    missionType: "ScheduleInterview",
    payload
  });
}
