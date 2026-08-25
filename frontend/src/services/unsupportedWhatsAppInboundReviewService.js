/**
 * BR-156 — Unsupported Meta WhatsApp inbound review alerts.
 */

import { apiFetch } from "./apiClient";

export async function fetchPendingUnsupportedWhatsAppInboundReviews() {
  return apiFetch("/api/unsupported-whatsapp-inbound-reviews/pending");
}

export async function dismissUnsupportedWhatsAppInboundReview(reviewId) {
  return apiFetch(`/api/unsupported-whatsapp-inbound-reviews/${reviewId}/dismiss`, {
    method: "POST"
  });
}

export async function confirmUnsupportedWhatsAppInboundReview(reviewId, campaignCode = null) {
  return apiFetch(`/api/unsupported-whatsapp-inbound-reviews/${reviewId}/confirm`, {
    method: "POST",
    body: JSON.stringify({
      campaignCode: campaignCode || null
    })
  });
}
