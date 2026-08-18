/**
 * Canonical PolicyExtraction application service.
 * Implements BR-052 (Atlas Extract) + BR-054 (PII isolation).
 */

const {
  POLICY_EXTRACTION_STATUSES,
  POLICY_EXTRACTION_METHODS,
  POLICY_EXTRACTION_SCHEMA_VERSION,
  REPORT_MODES
} = require("../domain/constants");
const {
  normalizePolicyExtractionData,
  hasExtractedIdentity,
  applyRulesHints
} = require("../domain/PolicyExtractionModel");
const { createSignedDownloadUrl } = require("../infrastructure/policyDocumentStorage");
const { mapReview, mapDocument, mapExtraction } = require("./policyMappers");
const { buildPolicyReport } = require("./policyReportService");
const { assembleClientPolicyReport } = require("./assembleClientPolicyReport");
const {
  gateExtractionForAi,
  gateExtractionForBenchmark,
  gateExtractionForKnowledgeCenter
} = require("./knowledgeCenterGate");
const { enrichExtractionWithLanguageLayer } = require("./enrichExtractionWithLanguageLayer");
const {
  analyzeInsuranceLanguage,
  getLanguageLayerCatalog
} = require("../domain/insurance-language/languageLayer");

function httpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

class PolicyExtractionService {
  constructor({ repository, annualValuesService } = {}) {
    this.repository = repository;
    this.annualValuesService = annualValuesService || null;
  }

  async getReviewBundle(organizationId, reviewId) {
    const review = await this.repository.getReview(organizationId, reviewId);

    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const [documents, extractions] = await Promise.all([
      this.repository.listDocumentsForReview(organizationId, reviewId),
      this.repository.listExtractionsForReview(organizationId, reviewId)
    ]);

    return {
      review: mapReview(review),
      documents: documents.map(mapDocument),
      extractions: extractions.map(mapExtraction)
    };
  }

  async listReviews(organizationId) {
    const rows = await this.repository.listReviews(organizationId);
    return rows.map(mapReview);
  }

  async getExtractionForDocument(organizationId, documentId) {
    const document = await this.repository.getDocument(organizationId, documentId);

    if (!document) {
      throw httpError("Policy document not found.", 404, "POLICY_DOCUMENT_NOT_FOUND");
    }

    const extraction = await this.repository.getExtractionByDocument(organizationId, documentId);

    return {
      document: mapDocument(document),
      extraction: mapExtraction(extraction)
    };
  }

  /**
   * Upsert structured fields into the canonical extraction model for a document.
   */
  async applyStructuredExtraction({
    organizationId,
    userId,
    documentId,
    structuredFields = {},
    merge = true
  }) {
    const document = await this.repository.getDocument(organizationId, documentId);

    if (!document) {
      throw httpError("Policy document not found.", 404, "POLICY_DOCUMENT_NOT_FOUND");
    }

    let extraction = await this.repository.getExtractionByDocument(organizationId, documentId);

    const incoming = normalizePolicyExtractionData(structuredFields);
    const base = merge && extraction?.extracted_data
      ? normalizePolicyExtractionData({
          ...extraction.extracted_data,
          ...structuredFields,
          premium: {
            ...(extraction.extracted_data.premium || {}),
            ...(structuredFields.premium || {})
          },
          rawFields: {
            ...(extraction.extracted_data.rawFields || {}),
            ...(structuredFields.rawFields || {})
          }
        })
      : incoming;

    const extractedData = applyRulesHints(base, extraction?.source_hints || {});
    const extracted = hasExtractedIdentity(extractedData);
    const now = new Date().toISOString();
    const { extractedData: layeredData } = enrichExtractionWithLanguageLayer(extractedData, {
      extractionId: extraction?.id || documentId
    });

    if (!extraction) {
      extraction = await this.repository.createExtraction({
        organization_id: organizationId,
        policy_review_id: document.policy_review_id,
        policy_document_id: documentId,
        schema_version: POLICY_EXTRACTION_SCHEMA_VERSION,
        status: extracted
          ? POLICY_EXTRACTION_STATUSES.EXTRACTED
          : POLICY_EXTRACTION_STATUSES.PENDING,
        extraction_method: POLICY_EXTRACTION_METHODS.STRUCTURED_INGEST,
        extracted_data: layeredData,
        field_confidence: {},
        source_hints: {},
        extracted_at: extracted ? now : null,
        extracted_by: extracted ? userId || null : null,
        metadata: {
          atlasExtract: true,
          ai: false,
          ocr: false,
          insuranceLanguageLayer: true
        }
      });
    } else {
      extraction = await this.repository.updateExtraction(organizationId, extraction.id, {
        schema_version: POLICY_EXTRACTION_SCHEMA_VERSION,
        status: extracted
          ? POLICY_EXTRACTION_STATUSES.EXTRACTED
          : POLICY_EXTRACTION_STATUSES.PENDING,
        extraction_method: POLICY_EXTRACTION_METHODS.STRUCTURED_INGEST,
        extracted_data: layeredData,
        error_message: null,
        extracted_at: extracted ? now : extraction.extracted_at,
        extracted_by: extracted ? userId || null : extraction.extracted_by,
        metadata: {
          ...(extraction.metadata || {}),
          insuranceLanguageLayer: true
        }
      });
    }

    if (
      this.annualValuesService &&
      Array.isArray(extractedData.annualValues) &&
      extractedData.annualValues.length > 0
    ) {
      await this.annualValuesService.upsertForReview({
        organizationId,
        userId,
        reviewId: document.policy_review_id,
        extractionId: extraction.id,
        rows: extractedData.annualValues,
        source: "structured_table"
      });
    }

    return {
      document: mapDocument(document),
      extraction: mapExtraction(extraction),
      languageLayer: analyzeInsuranceLanguage(extractedData, {
        extractionId: extraction.id
      })
    };
  }

  async createDownloadUrl(organizationId, documentId) {
    const document = await this.repository.getDocument(organizationId, documentId);

    if (!document) {
      throw httpError("Policy document not found.", 404, "POLICY_DOCUMENT_NOT_FOUND");
    }

    if (!document.storage_path || document.upload_status !== "stored") {
      throw httpError("Document is not available for download.", 404, "POLICY_DOCUMENT_NOT_STORED");
    }

    const signed = await createSignedDownloadUrl(document.storage_path);

    return {
      documentId: document.id,
      fileName: document.file_name,
      ...signed
    };
  }

  async getReport(organizationId, reviewId, mode = REPORT_MODES.INTERNAL) {
    const review = await this.repository.getReview(organizationId, reviewId);

    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const [documents, extractions] = await Promise.all([
      this.repository.listDocumentsForReview(organizationId, reviewId),
      this.repository.listExtractionsForReview(organizationId, reviewId)
    ]);

    return buildPolicyReport({ review, documents, extractions }, { mode });
  }

  /**
   * Client-facing report — persisted BR-144 DTOs only. No PDF re-parse.
   */
  async getClientReport(organizationId, reviewId) {
    const review = await this.repository.getReview(organizationId, reviewId);

    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const [extractions, annual] = await Promise.all([
      this.repository.listExtractionsForReview(organizationId, reviewId),
      this.annualValuesService
        ? this.annualValuesService.getForReview(organizationId, reviewId)
        : Promise.resolve({ annualValues: null })
    ]);

    const latestExtraction = (extractions || [])[0] || null;
    const extractedData = latestExtraction?.extracted_data || latestExtraction?.extractedData || {};

    return assembleClientPolicyReport({
      review: mapReview(review),
      extractedData: normalizePolicyExtractionData(extractedData),
      annualValues: annual?.annualValues || null
    });
  }

  async getAiContextForDocument(organizationId, documentId) {
    const { extraction, document } = await this.getExtractionForDocument(
      organizationId,
      documentId
    );

    if (!extraction) {
      throw httpError("Policy extraction not found.", 404, "POLICY_EXTRACTION_NOT_FOUND");
    }

    const reviewId =
      document?.reviewId || document?.policyReviewId || extraction.reviewId || null;

    // BR-057: AI consumes Facts + Findings only (never creates/modifies Facts).
    return gateExtractionForAi(extraction.extractedData, {
      reviewId,
      extractionId: extraction.id
    });
  }

  getLanguageCatalog() {
    return getLanguageLayerCatalog();
  }

  async getLanguageAnalysisForDocument(organizationId, documentId) {
    const { extraction, document } = await this.getExtractionForDocument(
      organizationId,
      documentId
    );

    if (!extraction) {
      throw httpError("Policy extraction not found.", 404, "POLICY_EXTRACTION_NOT_FOUND");
    }

    return {
      reviewId: document?.reviewId || extraction.reviewId || null,
      documentId,
      extractionId: extraction.id,
      ...analyzeInsuranceLanguage(extraction.extractedData, {
        extractionId: extraction.id
      })
    };
  }

  async getBenchmarkFeaturesForDocument(organizationId, documentId) {
    const { extraction } = await this.getExtractionForDocument(organizationId, documentId);

    if (!extraction) {
      throw httpError("Policy extraction not found.", 404, "POLICY_EXTRACTION_NOT_FOUND");
    }

    return gateExtractionForBenchmark(extraction.extractedData);
  }

  async getKnowledgePayloadForDocument(organizationId, documentId) {
    const { extraction } = await this.getExtractionForDocument(organizationId, documentId);

    if (!extraction) {
      throw httpError("Policy extraction not found.", 404, "POLICY_EXTRACTION_NOT_FOUND");
    }

    return gateExtractionForKnowledgeCenter(extraction.extractedData);
  }
}

module.exports = { PolicyExtractionService };
