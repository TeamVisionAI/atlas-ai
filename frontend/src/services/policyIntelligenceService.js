/**
 * Policy Intelligence API client — Atlas Extract (BR-052).
 */

import { apiFetch, apiRequest } from "./apiClient";

export async function fetchPolicyIntelligenceSummary() {
  return apiFetch("/api/policy-intelligence");
}

export async function listPolicyReviews() {
  const payload = await apiFetch("/api/policy-intelligence/reviews");
  return payload.reviews || [];
}

export async function createPolicyReview({ title, summary } = {}) {
  const payload = await apiFetch("/api/policy-intelligence/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, summary })
  });
  return payload.review;
}

export async function fetchPolicyReviewBundle(reviewId) {
  return apiFetch(`/api/policy-intelligence/reviews/${encodeURIComponent(reviewId)}`);
}

export async function uploadPolicyDocument(reviewId, file, structuredFields = null) {
  const formData = new FormData();
  formData.append("document", file);

  if (structuredFields && typeof structuredFields === "object") {
    formData.append("structuredFields", JSON.stringify(structuredFields));
  }

  const response = await apiRequest(
    `/api/policy-intelligence/reviews/${encodeURIComponent(reviewId)}/documents`,
    {
      method: "POST",
      body: formData
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Failed to upload policy document.");
  }

  return payload;
}

export async function savePolicyExtraction(documentId, extractedData, { merge = true } = {}) {
  return apiFetch(`/api/policy-intelligence/documents/${encodeURIComponent(documentId)}/extraction`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extractedData, merge })
  });
}

export async function fetchPolicyDocumentDownloadUrl(documentId) {
  return apiFetch(
    `/api/policy-intelligence/documents/${encodeURIComponent(documentId)}/download-url`
  );
}

export async function fetchComparisonCatalog() {
  return apiFetch("/api/policy-intelligence/comparison/catalog");
}

export async function comparePolicyReview(reviewId, body = {}) {
  return apiFetch(`/api/policy-intelligence/reviews/${encodeURIComponent(reviewId)}/comparison`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function comparePolicyReviewStress(reviewId, stress = {}) {
  return apiFetch(
    `/api/policy-intelligence/reviews/${encodeURIComponent(reviewId)}/comparison/stress`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stress })
    }
  );
}

export async function analyzeComparison(scenarios, options = {}) {
  return apiFetch("/api/policy-intelligence/comparison/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenarios,
      comparisonType: options.comparisonType,
      metricIds: options.metricIds
    })
  });
}
