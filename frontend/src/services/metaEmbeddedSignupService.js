/**
 * Sprint 6 — Meta Embedded Signup API client.
 */

import { apiFetch, apiRequest } from "./apiClient";

export class MetaEmbeddedSignupError extends Error {
  constructor(message, payload = {}) {
    super(message);
    this.name = "MetaEmbeddedSignupError";
    this.payload = payload;
  }
}

export async function getEmbeddedSignupStatus() {
  try {
    return await apiFetch("/api/meta/embedded-signup/status");
  } catch (error) {
    const match = error.message.match(/^API (\d+):/);
    throw new MetaEmbeddedSignupError("Failed to load WhatsApp connection status", {
      status: match ? Number(match[1]) : undefined
    });
  }
}

export async function getEmbeddedSignupHealth() {
  try {
    return await apiFetch("/api/meta/embedded-signup/health");
  } catch (error) {
    const match = error.message.match(/^API (\d+):/);
    throw new MetaEmbeddedSignupError("Failed to check WhatsApp connection health", {
      status: match ? Number(match[1]) : undefined
    });
  }
}

export async function exchangeEmbeddedSignupCode(payload) {
  const response = await apiRequest("/api/meta/embedded-signup/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MetaEmbeddedSignupError(body.message || "Embedded signup exchange failed", body);
  }

  if (body.access_token || body.accessToken) {
    throw new MetaEmbeddedSignupError("Unexpected credential field in API response.");
  }

  return body;
}
