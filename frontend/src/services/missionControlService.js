const API_URL = "http://localhost:3000";

export class MissionControlError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "MissionControlError";
    this.status = status;
  }
}

/**
 * @param {string} [phone]
 * @returns {Promise<import("../types/missionControl").MissionControlResponse | null>}
 */
export async function getMissionControl(phone) {
  const segment = phone ? encodeURIComponent(phone) : "latest";
  const response = await fetch(`${API_URL}/api/mission-control/${segment}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new MissionControlError("Failed to load mission control", response.status);
  }

  return response.json();
}

/**
 * @param {string} phone
 * @param {string} action
 * @param {Object} [payload]
 * @returns {Promise<import("../types/missionControl").MissionControlActionResult>}
 */
export async function postMissionControlAction(phone, action, payload = {}) {
  const response = await fetch(
    `${API_URL}/api/mission-control/${encodeURIComponent(phone)}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload })
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to execute mission control action", response.status);
  }

  return result;
}

/**
 * @param {string} phone
 * @param {Object} workflowState
 */
export async function syncMissionControlWorkflow(phone, workflowState) {
  const response = await fetch(
    `${API_URL}/api/mission-control/${encodeURIComponent(phone)}/workflow`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflowState)
    }
  );

  if (!response.ok) {
    throw new MissionControlError("Failed to sync workflow state", response.status);
  }

  return response.json();
}
