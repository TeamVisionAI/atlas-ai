import { getAuthHeaders } from "./atlasAuthService";

const API_URL = "http://localhost:3000";

export class QuickCaptureError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "QuickCaptureError";
    this.status = status;
    this.payload = payload;
  }
}

export async function saveQuickCaptureProspect(body) {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders())
  };

  const response = await fetch(`${API_URL}/api/prospects/quick-capture`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new QuickCaptureError(payload.message || "Quick Capture failed.", {
      status: response.status,
      payload
    });
  }

  return payload;
}
