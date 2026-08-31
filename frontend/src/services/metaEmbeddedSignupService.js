/**
 * Sprint 6 — Meta Embedded Signup API client.
 */

import { apiFetch, apiRequest } from "./apiClient";
import { logAuthorizationCodeTrace } from "../utils/authorizationCodeTrace";
import { selectEmbeddedSignupConnectionState } from "../engines/whatsappEmbeddedSignupOwnership";

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

export async function exchangeEmbeddedSignupCode(payload, debugLabel = "[META_EMBEDDED_SIGNUP]") {
  await logAuthorizationCodeTrace(debugLabel, "http_post_body", payload.code, {
    endpoint: "POST /api/meta/embedded-signup/exchange"
  });

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

export async function disconnectWhatsAppIntegration({ ownership = "personal" } = {}) {
  return apiFetch("/api/meta/embedded-signup/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownership })
  });
}

export async function updateWhatsAppMetaAdDestinationAutomation({
  enabled,
  ownership = "personal"
} = {}) {
  return apiFetch("/api/meta/embedded-signup/ad-destination-automation", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enabled: enabled === true,
      ownership
    })
  });
}

/**
 * Fire-and-forget structured stage log (no secrets).
 */
export async function reportEmbeddedSignupStage(
  stage,
  { attemptId = null, ownershipMode = "personal", ...extra } = {}
) {
  try {
    await apiRequest("/api/meta/embedded-signup/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        attemptId,
        ownershipMode,
        ...extra
      })
    });
  } catch {
    // Observability must not block the handoff UX.
  }
}

export async function verifyEmbeddedSignupConnected(ownershipMode = "personal") {
  const status = await getEmbeddedSignupStatus();
  const selected = selectEmbeddedSignupConnectionState(status, ownershipMode);
  if (selected.connected === true && selected.connection) {
    return {
      verified: true,
      connection: selected.connection,
      status
    };
  }
  return {
    verified: false,
    status,
    reason: "status_disconnected"
  };
}
