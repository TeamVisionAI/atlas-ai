/**
 * Policy Intelligence reports — internal vs shared (BR-054 / BR-056).
 * Neither mode exposes prospectId, policy numbers, or client ownership names.
 */

const { REPORT_MODES } = require("../domain/constants");
const { toIntelligencePayload } = require("../domain/PolicyExtractionModel");
const { sanitizePiiText } = require("../domain/piiSanitizer");
const { assertNoCrmIdentityLeak } = require("../domain/crmBoundary");
const { mapReview, mapDocument, mapExtraction } = require("./policyMappers");

function buildInternalReport({ review, documents, extractions }) {
  const payload = {
    mode: REPORT_MODES.INTERNAL,
    piiIncluded: false,
    crmLinkageIncluded: false,
    identityOwner: "crm",
    mechanicsOwner: "policy_intelligence",
    review: mapReview(review, { audience: "internal" }),
    documents: (documents || []).map((row) => mapDocument(row, { audience: "internal" })),
    extractions: (extractions || []).map((row) => mapExtraction(row, { audience: "internal" })),
    note:
      "Internal Atlas Policy Intelligence report — identified by reviewId only. CRM identity fields are excluded (BR-056)."
  };

  assertNoCrmIdentityLeak(payload, "internal_report");
  return payload;
}

function buildSharedReport({ review, documents, extractions }) {
  const sharedExtractions = (extractions || []).map((row) => {
    const mapped = mapExtraction(row, { audience: "shared" });
    return {
      ...mapped,
      extractedData: toIntelligencePayload(mapped.extractedData)
    };
  });

  const payload = {
    mode: REPORT_MODES.SHARED,
    piiIncluded: false,
    crmLinkageIncluded: false,
    identityOwner: "crm",
    mechanicsOwner: "policy_intelligence",
    review: {
      reviewId: review?.id || null,
      id: review?.id || null,
      title: sanitizePiiText(review?.title || ""),
      status: review?.status || null,
      summary: sanitizePiiText(review?.summary || ""),
      createdAt: review?.created_at || review?.createdAt || null
    },
    documents: (documents || []).map((row) => ({
      id: row.id,
      reviewId: row.policy_review_id || row.reviewId,
      uploadStatus: row.upload_status || row.uploadStatus,
      mimeType: row.mime_type || row.mimeType,
      fileSizeBytes: row.file_size_bytes ?? row.fileSizeBytes,
      fileName: "[DOCUMENT]"
    })),
    extractions: sharedExtractions,
    note:
      "Shared report — anonymous insurance information only. No PII or CRM linkage (BR-054 / BR-056)."
  };

  assertNoCrmIdentityLeak(payload, "shared_report");
  return payload;
}

function buildPolicyReport(bundle, { mode = REPORT_MODES.INTERNAL } = {}) {
  const normalized = String(mode || REPORT_MODES.INTERNAL).toLowerCase();

  if (normalized === REPORT_MODES.SHARED) {
    return buildSharedReport(bundle);
  }

  return buildInternalReport(bundle);
}

module.exports = {
  buildPolicyReport,
  buildInternalReport,
  buildSharedReport
};
