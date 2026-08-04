/**
 * Row → API DTO mappers for Policy Intelligence.
 * Implements BR-054 / BR-056 — reviews identified by reviewId only; no CRM PII.
 */

const { toIntelligencePayload } = require("../domain/PolicyExtractionModel");
const { sanitizePiiText } = require("../domain/piiSanitizer");

/**
 * Policy Intelligence public review identity is reviewId only (BR-056).
 * prospect_id may exist in DB as an internal CRM FK but is never mapped here.
 */
function mapReview(row, { audience = "internal" } = {}) {
  if (!row) {
    return null;
  }

  const base = {
    reviewId: row.id,
    id: row.id,
    title: row.title,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (audience === "shared" || audience === "intelligence") {
    return {
      ...base,
      title: sanitizePiiText(row.title || ""),
      summary: sanitizePiiText(row.summary || "")
    };
  }

  // Internal PI workspace — still no prospectId / policyNumber / ownership names.
  return {
    ...base,
    reviewedAt: row.reviewed_at,
    createdBy: row.created_by,
    // Boolean only: whether a CRM link exists — never the prospect UUID itself.
    crmLinked: Boolean(row.prospect_id),
    hasCrmPolicyRef: Boolean(row.crm_policy_ref_hash),
    metadata: {
      ...(row.metadata || {}),
      crmBoundary: true,
      identityOwner: "crm",
      mechanicsOwner: "policy_intelligence"
    }
  };
}

function mapDocument(row, { audience = "internal" } = {}) {
  if (!row) {
    return null;
  }

  if (audience === "shared" || audience === "intelligence") {
    return {
      id: row.id,
      reviewId: row.policy_review_id,
      uploadStatus: row.upload_status,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      fileName: audience === "shared" ? "[DOCUMENT]" : sanitizePiiText(row.file_name || ""),
      createdAt: row.created_at
    };
  }

  return {
    id: row.id,
    reviewId: row.policy_review_id,
    policyReviewId: row.policy_review_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    checksum: row.checksum,
    pageCount: row.page_count,
    uploadStatus: row.upload_status,
    metadata: row.metadata || {},
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExtraction(row, { audience = "internal" } = {}) {
  if (!row) {
    return null;
  }

  const extractedData = toIntelligencePayload(row.extracted_data || {});

  if (audience === "shared" || audience === "intelligence") {
    return {
      id: row.id,
      reviewId: row.policy_review_id,
      policyDocumentId: row.policy_document_id,
      schemaVersion: extractedData.schemaVersion,
      status: row.status,
      extractionMethod: row.extraction_method,
      extractedData,
      extractedAt: row.extracted_at
    };
  }

  return {
    id: row.id,
    reviewId: row.policy_review_id,
    policyReviewId: row.policy_review_id,
    policyDocumentId: row.policy_document_id,
    schemaVersion: extractedData.schemaVersion,
    status: row.status,
    extractionMethod: row.extraction_method,
    extractedData,
    fieldConfidence: row.field_confidence || {},
    sourceHints: {
      mimeType: row.source_hints?.mimeType || null,
      hasFileName: Boolean(row.source_hints?.hasFileName),
      suggestedProductType: row.source_hints?.suggestedProductType || null
    },
    errorMessage: row.error_message,
    extractedAt: row.extracted_at,
    extractedBy: row.extracted_by,
    metadata: {
      ...(row.metadata || {}),
      piiIsolation: true,
      zeroKnowledge: true,
      crmBoundary: true
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  mapReview,
  mapDocument,
  mapExtraction
};
