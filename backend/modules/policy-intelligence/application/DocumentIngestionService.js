/**
 * Document ingestion pipeline — upload + store + seed extraction.
 * Implements BR-052. No AI / OCR.
 */

const crypto = require("crypto");
const { randomUUID } = require("crypto");
const {
  POLICY_REVIEW_STATUSES,
  POLICY_DOCUMENT_UPLOAD_STATUSES,
  POLICY_EXTRACTION_STATUSES,
  POLICY_EXTRACTION_METHODS,
  POLICY_EXTRACTION_SCHEMA_VERSION,
  ALLOWED_POLICY_DOCUMENT_MIME_TYPES,
  MAX_POLICY_DOCUMENT_BYTES
} = require("../domain/constants");
const {
  createEmptyPolicyExtractionData,
  normalizePolicyExtractionData,
  hasExtractedIdentity,
  buildRulesHintsFromDocument,
  applyRulesHints
} = require("../domain/PolicyExtractionModel");
const { uploadPolicyDocument } = require("../infrastructure/policyDocumentStorage");
const { mapReview, mapDocument, mapExtraction } = require("./policyMappers");
const { hashCrmPolicyNumber } = require("../domain/crmBoundary");
const { enrichExtractionWithLanguageLayer } = require("./enrichExtractionWithLanguageLayer");

function httpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

class DocumentIngestionService {
  constructor({ repository, annualValuesService } = {}) {
    this.repository = repository;
    this.annualValuesService = annualValuesService || null;
  }

  /**
   * Create a Policy Intelligence review identified by reviewId.
   * prospectId / policyNumber are CRM-owned: stored only as internal FK / hash (BR-056).
   */
  async createReview({
    organizationId,
    userId,
    title,
    prospectId = null,
    policyNumber = null,
    summary = null
  }) {
    const trimmedTitle = String(title || "").trim();

    if (!trimmedTitle) {
      throw httpError("Review title is required.", 400, "POLICY_REVIEW_TITLE_REQUIRED");
    }

    const row = await this.repository.createReview({
      organization_id: organizationId,
      title: trimmedTitle,
      status: POLICY_REVIEW_STATUSES.DRAFT,
      owner_user_id: userId || null,
      // Internal CRM FK only — never returned by PI mappers (BR-056).
      prospect_id: prospectId || null,
      crm_policy_ref_hash: hashCrmPolicyNumber(policyNumber, organizationId),
      summary: summary || null,
      metadata: {
        crmBoundary: true,
        identityOwner: "crm",
        mechanicsOwner: "policy_intelligence"
      },
      created_by: userId || null
    });

    return mapReview(row);
  }

  /**
   * Ingest a document: persist file → document row → extraction row.
   * Optional structuredFields populate the canonical PolicyExtraction model.
   */
  async ingestDocument({
    organizationId,
    userId,
    reviewId,
    file,
    structuredFields = null
  }) {
    if (!file?.buffer) {
      throw httpError("Document file is required.", 400, "POLICY_DOCUMENT_REQUIRED");
    }

    if (!ALLOWED_POLICY_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      throw httpError(
        "Unsupported document type. Allowed: PDF, JPEG, PNG, WebP, plain text, JSON.",
        400,
        "POLICY_DOCUMENT_TYPE_INVALID"
      );
    }

    if (file.size > MAX_POLICY_DOCUMENT_BYTES || file.buffer.length > MAX_POLICY_DOCUMENT_BYTES) {
      throw httpError("Document must be 25 MB or smaller.", 400, "POLICY_DOCUMENT_TOO_LARGE");
    }

    const review = await this.repository.getReview(organizationId, reviewId);

    if (!review) {
      throw httpError("Policy review not found.", 404, "POLICY_REVIEW_NOT_FOUND");
    }

    const documentId = randomUUID();
    const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const fileName = file.originalname || "policy-document";

    let storagePath = null;

    try {
      const uploaded = await uploadPolicyDocument({
        organizationId,
        reviewId,
        documentId,
        fileName,
        mimeType: file.mimetype,
        buffer: file.buffer
      });
      storagePath = uploaded.storagePath;
    } catch (error) {
      await this.repository.createDocument({
        id: documentId,
        organization_id: organizationId,
        policy_review_id: reviewId,
        file_name: fileName,
        storage_path: null,
        mime_type: file.mimetype,
        file_size_bytes: file.buffer.length,
        checksum,
        upload_status: POLICY_DOCUMENT_UPLOAD_STATUSES.FAILED,
        metadata: { error: error.message },
        uploaded_by: userId || null
      });
      throw error;
    }

    const document = await this.repository.createDocument({
      id: documentId,
      organization_id: organizationId,
      policy_review_id: reviewId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: file.mimetype,
      file_size_bytes: file.buffer.length,
      checksum,
      upload_status: POLICY_DOCUMENT_UPLOAD_STATUSES.STORED,
      metadata: {},
      uploaded_by: userId || null
    });

    const hints = buildRulesHintsFromDocument({
      fileName,
      mimeType: file.mimetype
    });

    const inputProvided = Boolean(structuredFields && typeof structuredFields === "object");
    let extractedData = inputProvided
      ? normalizePolicyExtractionData(structuredFields)
      : createEmptyPolicyExtractionData();

    extractedData = applyRulesHints(extractedData, hints);
    const rulesApplied = Boolean(
      hints.suggestedProductType &&
        (extractedData.productType === hints.suggestedProductType ||
          extractedData.product === hints.suggestedProductType)
    );

    const extracted = hasExtractedIdentity(extractedData);
    const extractionMethod = inputProvided
      ? POLICY_EXTRACTION_METHODS.STRUCTURED_INGEST
      : rulesApplied
        ? POLICY_EXTRACTION_METHODS.RULES
        : POLICY_EXTRACTION_METHODS.STRUCTURED_INGEST;

    // Placeholder id for fact provenance before insert; replaced after create when needed.
    const { extractedData: layeredData } = enrichExtractionWithLanguageLayer(extractedData, {
      extractionId: documentId
    });

    const extraction = await this.repository.createExtraction({
      organization_id: organizationId,
      policy_review_id: reviewId,
      policy_document_id: documentId,
      schema_version: POLICY_EXTRACTION_SCHEMA_VERSION,
      status: extracted
        ? POLICY_EXTRACTION_STATUSES.EXTRACTED
        : POLICY_EXTRACTION_STATUSES.PENDING,
      extraction_method: extractionMethod,
      extracted_data: layeredData,
      field_confidence: {},
      source_hints: hints,
      extracted_at: extracted ? new Date().toISOString() : null,
      extracted_by: extracted ? userId || null : null,
      metadata: {
        atlasExtract: true,
        ai: false,
        ocr: false,
        piiIsolation: true,
        zeroKnowledge: true,
        insuranceLanguageLayer: true,
        schemaVersion: POLICY_EXTRACTION_SCHEMA_VERSION
      }
    });

    if (
      this.annualValuesService &&
      file.mimetype === "application/pdf"
    ) {
      try {
        const illustration = await this.annualValuesService.extractAndPersistFromPdf({
          organizationId,
          userId,
          reviewId,
          extractionId: extraction.id,
          buffer: file.buffer
        });
        if (illustration.persisted) {
          await this.repository.updateExtraction(organizationId, extraction.id, {
            extracted_data: {
              ...layeredData,
              annualValues: illustration.annualValues?.analysis?.timeline || [],
              riders: [
                ...(layeredData.riders || []),
                ...illustration.riders
              ],
              policyCostTerms: illustration.policyCostTerms || layeredData.policyCostTerms || null
            },
            status: POLICY_EXTRACTION_STATUSES.EXTRACTED,
            extracted_at: new Date().toISOString(),
            metadata: {
              atlasExtract: true,
              ai: false,
              ocr: false,
              piiIsolation: true,
              zeroKnowledge: true,
              insuranceLanguageLayer: true,
              illustrationExtract: true,
              schemaVersion: POLICY_EXTRACTION_SCHEMA_VERSION
            }
          });
        }
      } catch {
        // Illustration extract is additive — upload still succeeds if tables are absent.
      }
    }

    if (review.status === POLICY_REVIEW_STATUSES.DRAFT) {
      await this.repository.updateReview(organizationId, reviewId, {
        status: POLICY_REVIEW_STATUSES.UPLOADED
      });
    }

    const refreshedReview = await this.repository.getReview(organizationId, reviewId);
    const refreshedExtraction = await this.repository.getExtractionByDocument(
      organizationId,
      documentId
    );

    return {
      review: mapReview(refreshedReview),
      document: mapDocument(document),
      extraction: mapExtraction(refreshedExtraction || extraction)
    };
  }
}

module.exports = { DocumentIngestionService };
