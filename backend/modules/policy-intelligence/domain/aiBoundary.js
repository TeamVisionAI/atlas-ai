/**
 * AI boundary for Policy Intelligence (BR-054 / BR-056 / BR-057).
 *
 * AI consumes Insurance Facts + Findings only.
 * AI never creates or modifies Facts.
 * AI never receives CRM/client identity.
 */

const { toIntelligencePayload } = require("./PolicyExtractionModel");
const { assertNoCrmIdentityLeak } = require("./crmBoundary");
const {
  analyzeInsuranceLanguage,
  buildAiLanguageContext
} = require("./insurance-language/languageLayer");

/**
 * Build the only object allowed into AI / LLM prompts for policy analysis.
 */
function buildAiPolicyContext(extractedData, { reviewId = null, extractionId = null } = {}) {
  const analysis = analyzeInsuranceLanguage(extractedData, { extractionId });
  const languageContext = buildAiLanguageContext(analysis, { reviewId });

  // Compatibility envelope — mechanics without recommendations as AI inputs.
  const data = toIntelligencePayload(extractedData);

  const context = {
    ...languageContext,
    boundary: "ai_policy_intelligence",
    piiAllowed: false,
    crmIdentifiersAllowed: false,
    clientIdentityAllowed: false,
    mayModifyFacts: false,
    mayCreateFacts: false,
    policy: {
      carrier: data.carrier,
      product: data.product || data.productType,
      productType: data.productType,
      insured: {
        gender: data.insured?.gender ?? null,
        issueAge: data.insured?.issueAge ?? null,
        underwritingClass: data.insured?.underwritingClass ?? null,
        riskClassification:
          data.insured?.riskClassification || data.insured?.underwritingClass || null,
        tobaccoStatus: data.insured?.tobaccoStatus ?? null
      },
      premium: data.premium,
      faceAmount: data.faceAmount,
      paymentMode: data.paymentMode,
      deathBenefitOption: data.deathBenefitOption,
      illustratedRate: data.illustratedRate,
      guaranteedRate: data.guaranteedRate,
      charges: data.charges,
      cashValues: data.cashValues,
      coi: data.coi,
      indexes: data.indexes,
      loans: data.loans,
      withdrawals: data.withdrawals,
      riders: data.riders,
      coverages: data.coverages,
      // BR-057: AI may see findings; recommendations are generated separately.
      findings: analysis.findings
    }
  };

  assertNoCrmIdentityLeak(context, "ai_context");
  assertNoPiiInAiContext(context);
  return context;
}

function assertNoPiiInAiContext(context) {
  assertNoCrmIdentityLeak(context, "ai_context");

  if (context?.mayModifyFacts === true || context?.mayCreateFacts === true) {
    const error = new Error("AI boundary violation: AI cannot create or modify Insurance Facts.");
    error.statusCode = 500;
    error.publicCode = "POLICY_AI_FACTS_BOUNDARY";
    throw error;
  }

  const json = JSON.stringify(context || {});
  const forbidden = [
    "policyNumber",
    "firstName",
    "lastName",
    "email",
    "phone",
    "ssn",
    "prospectId",
    "namedInsured",
    "beneficiary",
    "dateOfBirth",
    "clientName",
    "ownerName",
    "policyHolderName"
  ];

  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      const error = new Error(`AI boundary violation: forbidden key ${key}`);
      error.statusCode = 500;
      error.publicCode = "POLICY_AI_PII_BOUNDARY";
      throw error;
    }
  }

  return true;
}

module.exports = {
  buildAiPolicyContext,
  assertNoPiiInAiContext
};
