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

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore storage failures
  }
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

export async function bootstrapAtlasSession() {
  const existing = getStoredSessionToken();

  if (!existing) {
    return null;
  }

  const me = await apiRequest("/api/auth/me", {
    headers: { Authorization: `Bearer ${existing}` }
  });

  if (me.ok) {
    return existing;
  }

  clearSession();

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

export async function fetchCurrentUser() {
  const response = await apiRequest("/api/auth/me", {
    headers: {
      ...(await getAuthHeaders())
    }
  });

  if (!response.ok) {
    throw new Error("Unauthorized");
  }

  return response.json();
}

export async function signupWithEmail({ email, password, displayName }) {
  const response = await apiRequest("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Signup failed");
  }

  return payload;
}

export async function loginWithEmail({ email, password }) {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Login failed");
  }

  return payload;
}
