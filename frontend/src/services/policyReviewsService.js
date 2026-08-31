/**
 * BR-186 — Policy Review Pipeline API client.
 */

import { apiFetch } from "./apiClient";

export class PolicyReviewsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "PolicyReviewsError";
    this.status = status;
  }
}

function wrap(error, fallback) {
  const match = String(error.message || "").match(/^API (\d+):/);
  throw new PolicyReviewsError(fallback, match ? Number(match[1]) : undefined);
}

export async function getPolicyReviews(options = {}) {
  const params = new URLSearchParams();
  if (options.search) params.set("q", options.search);
  if (options.scope && options.scope !== "mine") params.set("scope", options.scope);
  if (options.stage) params.set("stage", options.stage);
  if (options.clientId) params.set("clientId", options.clientId);
  if (options.ownerUserId) params.set("ownerUserId", options.ownerUserId);
  const query = params.toString();
  try {
    return await apiFetch(`/api/policy-reviews${query ? `?${query}` : ""}`);
  } catch (error) {
    wrap(error, "Failed to load policy reviews");
  }
}

export async function createPolicyReview(payload = {}) {
  try {
    return await apiFetch("/api/policy-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create policy review");
  }
}

export async function updatePolicyReview(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update policy review");
  }
}

export async function transitionPolicyReviewStage(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to update policy review stage");
  }
}

export async function completePolicyReview(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to complete policy review");
  }
}

export async function recordPolicyReviewOutcome(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to record policy review outcome");
  }
}

export async function linkPolicyReviewAppointment(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/appointment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to link review appointment");
  }
}

export async function requestPolicyReviewDocuments(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to request review documents");
  }
}

export async function markPolicyReviewDocumentsReceived(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/documents/received`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to mark documents received");
  }
}

export async function submitPolicyReviewApplication(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/application`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to submit application");
  }
}

export async function markPolicyReviewPlaced(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/placed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to mark policy placed");
  }
}

export async function createPolicyReviewFollowUp(id, payload = {}) {
  try {
    return await apiFetch(`/api/policy-reviews/${encodeURIComponent(id)}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    wrap(error, "Failed to create policy review follow-up");
  }
}
