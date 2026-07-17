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
