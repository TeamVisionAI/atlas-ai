const API_URL = "http://localhost:3000";

export async function getMissionControl(phone) {
  const segment = phone ? encodeURIComponent(phone) : "latest";
  const response = await fetch(`${API_URL}/api/mission-control/${segment}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Failed to load mission control");
  }

  return response.json();
}
