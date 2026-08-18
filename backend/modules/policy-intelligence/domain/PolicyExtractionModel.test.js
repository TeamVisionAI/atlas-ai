/**
 * Unit tests — zero-knowledge PolicyExtraction model (BR-052 / BR-054).
 */

const {
  createEmptyPolicyExtractionData,
  normalizePolicyExtractionData,
  hasExtractedIdentity,
  buildRulesHintsFromDocument,
  applyRulesHints,
  toIntelligencePayload
} = require("./PolicyExtractionModel");
const { sanitizePiiText, prepareKnowledgeCenterPayload } = require("./piiSanitizer");
const { buildAiPolicyContext, assertNoPiiInAiContext } = require("./aiBoundary");
const { toBenchmarkFeatures } = require("./benchmarkBoundary");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const empty = createEmptyPolicyExtractionData();
  assert(empty.schemaVersion === "2.0", "schemaVersion must be 2.0");
  assert(empty.insured && "issueAge" in empty.insured, "insured block required");
  assert(!("policyNumber" in empty), "policyNumber must not exist");
  assert(!("namedInsureds" in empty), "namedInsureds must not exist");
  assert(!("beneficiaries" in empty), "beneficiaries must not exist");
  assert(!hasExtractedIdentity(empty), "empty model has no identity");

  const normalized = normalizePolicyExtractionData({
    carrier: "Acme Life",
    productType: "IUL",
    policyNumber: "POL-SHOULD-STRIP",
    namedInsureds: [{ name: "Jane Doe" }],
    beneficiaries: [{ name: "John Doe" }],
    firstName: "Jane",
    email: "jane@example.com",
    insured: {
      gender: "Female",
      issueAge: "36",
      underwritingClass: "Preferred Plus",
      tobaccoStatus: "Non-Smoker"
    },
    premium: { amount: "220", frequency: "monthly" },
    faceAmount: 500000,
    prospectId: "crm-id-should-strip"
  });

  assert(normalized.carrier === "Acme Life", "carrier kept");
  assert(normalized.insured.gender === "Female", "gender kept");
  assert(normalized.insured.issueAge === 36, "issueAge coerced");
  assert(normalized.faceAmount === 500000, "faceAmount kept");
  assert(normalized.policyNumber === undefined, "policyNumber stripped");
  assert(!normalized.namedInsureds, "namedInsureds stripped");
  assert(!normalized.beneficiaries, "beneficiaries stripped");
  assert(!normalized.firstName, "firstName stripped");
  assert(!normalized.email, "email stripped");
  assert(!normalized.prospectId, "prospectId stripped");
  assert(!normalized.mechanics.prospectId, "mechanics must not keep prospectId");
  assert(hasExtractedIdentity(normalized), "anonymous attributes count as extracted");

  const riderEconomics = normalizePolicyExtractionData({
    riders: [
      {
        type: "Terminal Illness",
        formNumber: "ICC13-NWLA-495",
        maximumAccelerationPercent: 50,
        payoutClassification: "CARRIER_CALCULATION_REQUIRED",
        discountMethodology: "more_than_dollar_for_dollar_at_claim"
      }
    ],
    policyCostTerms: { costOfInsurance: { annualDollars: null } }
  });
  assert(riderEconomics.riders[0].formNumber === "ICC13-NWLA-495", "normalize keeps form number");
  assert(riderEconomics.riders[0].maxAccelerationPercent === 50, "normalize keeps acceleration cap");
  assert(riderEconomics.policyCostTerms.costOfInsurance.annualDollars === null, "policyCostTerms passthrough");

  const hints = buildRulesHintsFromDocument({
    fileName: "John_Smith_term_life_AB1234567.pdf",
    mimeType: "application/pdf"
  });
  assert(!hints.fileName, "raw fileName must not leak into hints");
  assert(!hints.suggestedPolicyNumber, "policy number hints forbidden");
  assert(hints.suggestedProductType === "Term Life", "product type hint allowed");

  const withRules = applyRulesHints(createEmptyPolicyExtractionData(), hints);
  assert(withRules.productType === hints.suggestedProductType, "rules apply product type");

  const intelligence = toIntelligencePayload({
    ...normalized,
    policyNumber: "NOPE",
    email: "x@y.com"
  });
  assert(!intelligence.policyNumber, "intelligence payload strips policyNumber");
  assert(!intelligence.email, "intelligence payload strips email");

  const ai = buildAiPolicyContext(normalized, { reviewId: "rev-1" });
  assertNoPiiInAiContext(ai);
  assert(ai.reviewId === "rev-1", "AI may receive reviewId only");
  assert(ai.policy.insured.issueAge === 36, "AI gets issue age");
  assert(ai.clientIdentityAllowed === false, "AI forbids client identity");
  assert(!JSON.stringify(ai).includes("Jane"), "AI context has no person name");
  assert(!JSON.stringify(ai).includes("prospectId"), "AI has no prospectId");

  const { mapReview } = require("../application/policyMappers");
  const mapped = mapReview({
    id: "rev-1",
    title: "IUL review",
    status: "uploaded",
    prospect_id: "should-not-leak",
    crm_policy_ref_hash: "abc",
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  });
  assert(mapped.reviewId === "rev-1", "PI review identity is reviewId");
  assert(mapped.prospectId === undefined, "prospectId never mapped");
  assert(mapped.crmLinked === true, "crmLinked boolean allowed");
  assert(!JSON.stringify(mapped).includes("should-not-leak"), "prospect UUID absent");

  const { hashCrmPolicyNumber } = require("./crmBoundary");
  const hash = hashCrmPolicyNumber("POL-999", "org-1");
  assert(hash && hash.length === 64, "policy number hashed");
  assert(hash !== "POL-999", "hash is not plaintext");

  const benchmark = toBenchmarkFeatures(normalized);
  assert(benchmark.features.gender === "Female", "benchmark gender");
  assert(!benchmark.features.policyNumber, "benchmark has no policy number");

  const sanitized = sanitizePiiText(
    "Contact John Smith at john@email.com. Policy Number ABC12345. 123 Main Street."
  );
  assert(sanitized.includes("[EMAIL]"), "email masked");
  assert(sanitized.includes("[POLICY_ID]"), "policy id masked");
  assert(sanitized.includes("[ADDRESS]"), "address masked");
  assert(sanitized.includes("[REDACTED]"), "name masked");

  const knowledge = prepareKnowledgeCenterPayload({
    title: "John Smith policy",
    body: "Email jane@x.com Policy Number ZZ999",
    metadata: { prospectId: "abc", carrier: "Acme" }
  });
  assert(!knowledge.metadata.prospectId, "knowledge metadata drops prospectId");
  assert(knowledge.body.includes("[EMAIL]"), "knowledge body sanitized");
  assert(knowledge.sanitized === true, "knowledge marked sanitized");

  console.log("PolicyExtractionModel.test.js (BR-054 / BR-056) passed");
}

run();
