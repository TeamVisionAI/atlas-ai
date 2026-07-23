import { getAuthHeaders, getStoredSessionToken } from "./atlasAuthService";
import { apiRequest } from "./apiClient";

export async function fetchOnboardingStatus() {
  const response = await apiRequest("/api/onboarding/status", {
    headers: {
      ...(await getAuthHeaders())
    }
  });

  if (!response.ok) {
    throw new Error("Unable to load onboarding status");
  }

  return response.json();
}

export async function createOrganization(name) {
  const response = await apiRequest("/api/onboarding/organization", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify({ name })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to create organization");
  }

  return payload;
}

export async function completeMetaOnboarding({ whatsappStatus } = {}) {
  const response = await apiRequest("/api/onboarding/meta/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify({
      ...(whatsappStatus ? { whatsappStatus } : {})
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to complete Meta setup");
  }

  return payload;
}

export async function startCalendarConnect() {
  const response = await apiRequest("/api/onboarding/calendar/connect", {
    headers: {
      ...(await getAuthHeaders())
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to start calendar connect");
  }

  return payload;
}

export async function saveMeetingPreferences(preferences) {
  const response = await apiRequest("/api/onboarding/meeting-preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(preferences)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to save meeting preferences");
  }

  return payload;
}

export async function activateAtlas() {
  const response = await apiRequest("/api/onboarding/activate", {
    method: "POST",
    headers: {
      ...(await getAuthHeaders())
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to activate Atlas");
  }

  return payload;
}

export async function fetchHomeSummary() {
  const response = await apiRequest("/api/home/summary", {
    headers: {
      ...(await getAuthHeaders())
    }
  });

  if (!response.ok) {
    throw new Error("Unable to load dashboard");
  }

  return response.json();
}

export function hasSession() {
  return Boolean(getStoredSessionToken());
}
