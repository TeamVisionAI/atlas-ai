/**
 * Sprint 6 — Meta Embedded Signup API client.
 */

export class MetaEmbeddedSignupError extends Error {
  constructor(message, payload = {}) {
    super(message);
    this.name = "MetaEmbeddedSignupError";
    this.payload = payload;
  }
}

export async function getEmbeddedSignupStatus() {
  const response = await fetch("/api/meta/embedded-signup/status");

  if (!response.ok) {
    throw new MetaEmbeddedSignupError("Failed to load WhatsApp connection status", {
      status: response.status
    });
  }

  return response.json();
}

export async function getEmbeddedSignupHealth() {
  const response = await fetch("/api/meta/embedded-signup/health");

  if (!response.ok) {
    throw new MetaEmbeddedSignupError("Failed to check WhatsApp connection health", {
      status: response.status
    });
  }

  return response.json();
}

export async function exchangeEmbeddedSignupCode(payload) {
  const response = await fetch("/api/meta/embedded-signup/exchange", {
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
