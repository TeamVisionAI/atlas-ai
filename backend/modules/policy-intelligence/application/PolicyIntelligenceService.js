/**
 * Policy Intelligence facade — summary + orchestration entry.
 * Implements BR-051 / BR-052.
 */

const {
  MODULE_ID,
  MODULE_CAPABILITIES,
  POLICY_REVIEW_STATUSES,
  POLICY_DOCUMENT_UPLOAD_STATUSES,
  POLICY_EXTRACTION_STATUSES,
  POLICY_EXTRACTION_METHODS,
  POLICY_EXTRACTION_SCHEMA_VERSION
} = require("../domain/constants");
const { createEmptyPolicyExtractionData } = require("../domain/PolicyExtractionModel");
const { DocumentIngestionService } = require("./DocumentIngestionService");
const { PolicyExtractionService } = require("./PolicyExtractionService");
const { AnnualValuesService } = require("./AnnualValuesService");
const { ComparisonService } = require("./ComparisonService");

class PolicyIntelligenceService {
  constructor({ repository } = {}) {
    this.repository = repository;
    this.ingestion = new DocumentIngestionService({ repository });
    this.extraction = new PolicyExtractionService({ repository });
    this.annualValues = new AnnualValuesService({ repository });
    this.comparison = new ComparisonService({
      repository,
      annualValuesService: this.annualValues
    });
  }

  async getModuleSummary({ organizationId } = {}) {
    let counts = { reviews: 0, documents: 0, extractions: 0 };

    if (organizationId && this.repository) {
      try {
        const [reviews, documents, extractions] = await Promise.all([
          this.repository.countReviews(organizationId),
          this.repository.countDocuments(organizationId),
          this.repository.countExtractions(organizationId)
        ]);
        counts = { reviews, documents, extractions };
      } catch {
        counts = { reviews: 0, documents: 0, extractions: 0, unavailable: true };
      }
    }

    return {
      module: MODULE_ID,
      status: "comparison_engine",
      sprint: "Sprint 5 — Comparison Engine",
      organizationId: organizationId || null,
      capabilities: { ...MODULE_CAPABILITIES },
      aggregates: {
        policyReview: {
          table: "atlas_policy_reviews",
          statuses: Object.values(POLICY_REVIEW_STATUSES)
        },
        policyDocument: {
          table: "atlas_policy_documents",
          uploadStatuses: Object.values(POLICY_DOCUMENT_UPLOAD_STATUSES)
        },
        policyExtraction: {
          table: "atlas_policy_extractions",
          schemaVersion: POLICY_EXTRACTION_SCHEMA_VERSION,
          statuses: Object.values(POLICY_EXTRACTION_STATUSES),
          methods: Object.values(POLICY_EXTRACTION_METHODS),
          canonicalModel: createEmptyPolicyExtractionData()
        },
        annualValues: {
          tables: ["atlas_policy_annual_value_sets", "atlas_policy_annual_values"],
          engine: "annual_values_engine",
          version: "1.0"
        },
        comparison: {
          engine: "comparison_engine",
          version: "1.0",
          types: ["side_by_side", "current_vs_stress", "current_vs_alternative_funding", "current_iul_vs_alternative"]
        }
      },
      counts,
      message:
        "Sprint 5 Comparison Engine (BR-061): deterministic scenario comparison; Facts immutable; no AI/OCR."
    };
  }

  /** @deprecated use getModuleSummary */
  getFoundationSummary(args) {
    return this.getModuleSummary(args);
  }
}

module.exports = { PolicyIntelligenceService };
