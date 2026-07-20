import { apiRequest } from "./apiClient";

const SESSION_KEY = "atlas_session_token";

export function getStoredSessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function storeSessionToken(token) {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // ignore storage failures
  }
}

export async function bootstrapAtlasSession() {
  const existing = getStoredSessionToken();

  if (existing) {
    const me = await apiRequest("/api/auth/me", {
      headers: { Authorization: `Bearer ${existing}` }
    });

    if (me.ok) {
      return existing;
    }
  }

  const bootstrapToken = import.meta.env.VITE_ATLAS_BOOTSTRAP_TOKEN;

  if (!bootstrapToken) {
    return null;
  }

  const response = await apiRequest("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapToken })
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  storeSessionToken(payload.token);
  return payload.token;
}

export async function getAuthHeaders() {
  const token = getStoredSessionToken() || (await bootstrapAtlasSession());

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`
  };
}
