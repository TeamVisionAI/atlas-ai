/**
 * Policy Intelligence domain constants.
 * Implements BR-051, BR-052, BR-054 (PII isolation), BR-056 (CRM boundary).
 */

const MODULE_ID = "policy-intelligence";

const POLICY_REVIEW_STATUSES = Object.freeze({
  DRAFT: "draft",
  UPLOADED: "uploaded",
  IN_REVIEW: "in_review",
  COMPLETED: "completed",
  ARCHIVED: "archived"
});

const POLICY_DOCUMENT_UPLOAD_STATUSES = Object.freeze({
  PENDING: "pending",
  STORED: "stored",
  FAILED: "failed"
});

const POLICY_EXTRACTION_STATUSES = Object.freeze({
  PENDING: "pending",
  EXTRACTED: "extracted",
  FAILED: "failed"
});

const POLICY_EXTRACTION_METHODS = Object.freeze({
  STRUCTURED_INGEST: "structured_ingest",
  RULES: "rules"
});

/** Canonical zero-knowledge schema (BR-054). */
const POLICY_EXTRACTION_SCHEMA_VERSION = "2.0";

const POLICY_DOCUMENT_BUCKET = "policy-documents";
const MAX_POLICY_DOCUMENT_BYTES = 25 * 1024 * 1024;
const SIGNED_URL_EXPIRES_SECONDS = 60 * 10;

const ALLOWED_POLICY_DOCUMENT_MIME_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/json"
]);

const REPORT_MODES = Object.freeze({
  INTERNAL: "internal",
  SHARED: "shared"
});

const MODULE_CAPABILITIES = Object.freeze({
  ai: false,
  ocr: false,
  documentUpload: true,
  extraction: true,
  extractionMethods: Object.values(POLICY_EXTRACTION_METHODS),
  piiIsolation: true,
  zeroKnowledge: true,
  crmBoundary: true,
  reviewIdentity: "reviewId",
  insuranceLanguageLayer: true,
  factsImmutable: true,
  findingsFromBusinessRules: true,
  recommendationsFromFindings: true,
  policyIntelligenceRuleEngine: true,
  ruleEngineVersion: "1.0",
  annualValuesEngine: true,
  annualValuesEngineVersion: "1.0",
  comparisonEngine: true,
  comparisonEngineVersion: "1.0",
  reportModes: Object.values(REPORT_MODES)
});

/** Keys never allowed in canonical extraction or mechanics bags (BR-054 / BR-056). */
const FORBIDDEN_PII_KEYS = Object.freeze([
  "firstName",
  "lastName",
  "fullName",
  "name",
  "displayName",
  "address",
  "street",
  "city",
  "state",
  "zip",
  "postalCode",
  "email",
  "phone",
  "phoneNumber",
  "mobile",
  "ssn",
  "taxId",
  "tin",
  "policyNumber",
  "policyNo",
  "policyId",
  "dateOfBirth",
  "dob",
  "birthDate",
  "beneficiary",
  "beneficiaries",
  "beneficiaryName",
  "ownerName",
  "owner",
  "agentName",
  "agent",
  "namedInsured",
  "namedInsureds",
  "insuredName",
  "clientName",
  "client",
  "policyHolderName",
  "policyHolder",
  "holderName",
  "prospectId",
  "organizationId",
  "userId",
  "ownerUserId"
]);

module.exports = {
  MODULE_ID,
  POLICY_REVIEW_STATUSES,
  POLICY_DOCUMENT_UPLOAD_STATUSES,
  POLICY_EXTRACTION_STATUSES,
  POLICY_EXTRACTION_METHODS,
  POLICY_EXTRACTION_SCHEMA_VERSION,
  POLICY_DOCUMENT_BUCKET,
  MAX_POLICY_DOCUMENT_BYTES,
  SIGNED_URL_EXPIRES_SECONDS,
  ALLOWED_POLICY_DOCUMENT_MIME_TYPES,
  REPORT_MODES,
  MODULE_CAPABILITIES,
  FORBIDDEN_PII_KEYS,
  /** @deprecated use MODULE_CAPABILITIES */
  FOUNDATION_CAPABILITIES: MODULE_CAPABILITIES
};
