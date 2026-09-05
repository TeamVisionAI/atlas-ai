/**
 * BR-156 / BR-234 — Unsupported Meta WhatsApp inbound review queue.
 */

const REVIEW_TYPE = Object.freeze({
  UNSUPPORTED_WHATSAPP_INBOUND_REVIEW: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW"
});

const REVIEW_STATUS = Object.freeze({
  PENDING_REVIEW: "pending_review",
  RECOVERED_AUTOMATICALLY: "recovered_automatically",
  CONFIRMED_MANUAL: "confirmed_manual",
  DISMISSED_REVIEWED: "dismissed_reviewed"
});

const META_UNSUPPORTED_LEAD_ERROR_CODE = 131060;

const REVIEW_REASON = Object.freeze({
  META_UNSUPPORTED_131060: "META_UNSUPPORTED_131060",
  META_UNSUPPORTED_131060_CONTACT_ONLY: "META_UNSUPPORTED_131060_CONTACT_ONLY"
});

const ORGANIZATION_CONNECTION_SOURCE = "whatsapp_organization_connection";

const AUDIT_EVENT_TYPES = Object.freeze({
  RECOVERED: "unsupported_whatsapp_lead_recovered",
  CONFIRMED: "unsupported_whatsapp_lead_confirmed",
  DISMISSED: "unsupported_whatsapp_lead_dismissed"
});

module.exports = {
  REVIEW_TYPE,
  REVIEW_STATUS,
  META_UNSUPPORTED_LEAD_ERROR_CODE,
  REVIEW_REASON,
  ORGANIZATION_CONNECTION_SOURCE,
  AUDIT_EVENT_TYPES
};
