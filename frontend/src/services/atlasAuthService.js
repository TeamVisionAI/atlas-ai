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
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export async function fetchCurrentUser() {
  const token = getStoredSessionToken();

  if (!token) {
    return null;
  }

  const response = await apiRequest("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    storeSessionToken(null);
    return null;
  }

  return response.json();
}

export async function loginAtlasSession({ email, password, rememberMe = false }) {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Invalid email or password.");
  }

  storeSessionToken(payload.token);
  return payload;
}

export async function logoutAtlasSession() {
  const token = getStoredSessionToken();

  if (token) {
    await apiRequest("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
  }

  storeSessionToken(null);
}

export async function ensureAtlasSession() {
  const user = await fetchCurrentUser();
  return Boolean(user);
}

/** @deprecated LC1 — use loginAtlasSession */
export async function bootstrapAtlasSession() {
  return ensureAtlasSession() ? getStoredSessionToken() : null;
}

export async function getAuthHeaders() {
  const token = getStoredSessionToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`
  };
}
