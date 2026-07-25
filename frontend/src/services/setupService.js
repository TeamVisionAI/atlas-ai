import { apiRequest } from "./apiClient";

export async function fetchSetupStatus() {
  const response = await apiRequest("/api/setup/status");

  if (!response.ok) {
    throw new Error("Unable to check platform setup status.");
  }

  return response.json();
}

export async function completePlatformSetup(payload) {
  const response = await apiRequest("/api/setup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || "Unable to complete platform setup.");
  }

  return body;
}
