/**
 * Assemble the client-facing Policy Intelligence report from persisted DTOs (BR-144).
 * Does not parse PDFs. Does not invent costs, rider payouts, or investment series.
 */

const { ADAPTER_KEYS } = require("../domain/illustration-extract/detectIllustrationAdapter");
const {
  buildPolicyEconomicsReportDto,
  createEmptyPolicyCostTerms
} = require("../domain/policy-economics");

const SUPPORTED_ADAPTERS = new Set(Object.values(ADAPTER_KEYS));

const ATLAS_INFORMS =
  "Atlas informs. Representatives recommend. Clients decide.";
const REPLACEMENT_SAFEGUARD =
  "Do not cancel or surrender an existing policy before replacement coverage is approved and in force.";
const CARRIER_CALC_CAVEAT =
  "Some living-benefit amounts require a current carrier-specific calculation and underwriting review.";
const HYPOTHETICAL_CAVEAT =
  "Investment projections are hypothetical and not guaranteed.";

function hydrateTimeline(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    surrenderCharge:
      row.surrenderCharge ?? row.metadata?.surrenderCharge ?? row["Surrender Charge"] ?? null,
    sourcePage: row.sourcePage ?? row.metadata?.sourcePage ?? null
  }));
}

function collectStoredPages(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((page) => Number.isInteger(page) && page > 0)
  )].sort((a, b) => a - b);
}

function illustrationTableLabel(metadata = {}) {
  if (metadata.comparisonScenario === "current_illustrated") {
    return "Current Illustrated Annual Values";
  }
  if (metadata.illustrationScenario) {
    return String(metadata.illustrationScenario).replace(/_/g, " ");
  }
  return "Policy Illustration";
}

function year1Row(timeline = []) {
  return timeline.find((row) => Number(row.policyYear) === 1) || timeline[0] || null;
}

function buildSnapshot({ extractedData = {}, metadata = {}, timeline = [] } = {}) {
  const insured = extractedData.insured || {};
  const premium = extractedData.premium || {};
  const mechanics = extractedData.mechanics || {};
  const first = year1Row(timeline);

  return Object.freeze({
    carrier: extractedData.carrier || metadata.carrier || null,
    issuer: mechanics.issuer || metadata.issuer || extractedData.carrier || null,
    product: extractedData.product || extractedData.productType || metadata.product || null,
    productType: extractedData.productType || null,
    formVersion:
      mechanics.baseForm ||
      mechanics.formVersion ||
      metadata.baseForm ||
      extractedData.formVersion ||
      null,
    issueAge: insured.issueAge ?? first?.insuredAge ?? null,
    gender: insured.gender || null,
    underwritingClass: insured.underwritingClass || insured.riskClassification || null,
    tobaccoStatus: insured.tobaccoStatus || null,
    premiumAmount: premium.amount ?? first?.annualPremium ?? null,
    premiumFrequency: premium.frequency || extractedData.paymentMode || null,
    premiumCurrency: premium.currency || "USD",
    faceAmount: extractedData.faceAmount ?? first?.deathBenefit ?? null,
    deathBenefit: first?.deathBenefit ?? extractedData.faceAmount ?? null,
    deathBenefitOption: extractedData.deathBenefitOption || mechanics.deathBenefitOption || null
  });
}

function resolveAdapter(metadata = {}, extractedData = {}) {
  const adapterKey =
    metadata.adapterKey ||
    extractedData.adapterKey ||
    extractedData.mechanics?.adapterKey ||
    null;
  const supported = adapterKey == null || SUPPORTED_ADAPTERS.has(adapterKey);
  return Object.freeze({
    key: adapterKey,
    supported,
    message: supported
      ? null
      : "Policy structure requires additional review"
  });
}

function assembleClientPolicyReport({
  review = null,
  extractedData = {},
  annualValues = null
} = {}) {
  const metadata = annualValues?.metadata && typeof annualValues.metadata === "object"
    ? annualValues.metadata
    : {};
  const timeline = hydrateTimeline(annualValues?.timeline || []);
  const annualValuesAvailable = timeline.length > 0;
  const adapter = resolveAdapter(metadata, extractedData);
  const costTerms =
    metadata.policyCostTerms ||
    extractedData.policyCostTerms ||
    createEmptyPolicyCostTerms({ adapterKey: adapter.key });
  const riders = Array.isArray(metadata.riders) && metadata.riders.length
    ? metadata.riders
    : Array.isArray(extractedData.riders)
      ? extractedData.riders
      : [];

  const economics = adapter.supported
    ? buildPolicyEconomicsReportDto({
      timeline,
      costTerms,
      riders,
      adapterKey: adapter.key,
      carrier: extractedData.carrier || metadata.carrier || null,
      issuer: extractedData.mechanics?.issuer || metadata.issuer || null,
      product: extractedData.product || metadata.product || null
    })
    : null;

  return Object.freeze({
    layer: "client_policy_report",
    reviewId: review?.id || review?.reviewId || null,
    reviewTitle: review?.title || null,
    adapter,
    annualValuesAvailable,
    annualValuesUnavailableMessage: annualValuesAvailable
      ? null
      : "Illustrated annual values are not available for this review. Other sourced policy details are shown when present.",
    snapshot: buildSnapshot({ extractedData, metadata, timeline }),
    illustrationSource: Object.freeze({
      label: illustrationTableLabel(metadata),
      scenario: metadata.comparisonScenario || metadata.illustrationScenario || null,
      pages: collectStoredPages(timeline.map((row) => row.sourcePage))
    }),
    economics,
    fieldClassifications:
      annualValues?.calculationMetadata?.fieldClassifications || null,
    representativeNotes: extractedData.mechanics?.representativeNotes || metadata.notes || null,
    safeguards: Object.freeze({
      atlasInforms: ATLAS_INFORMS,
      replacement: REPLACEMENT_SAFEGUARD,
      carrierCalculation: CARRIER_CALC_CAVEAT,
      hypotheticalInvestments: HYPOTHETICAL_CAVEAT
    }),
    invented: false,
    interpolated: false
  });
}

module.exports = {
  assembleClientPolicyReport,
  hydrateTimeline,
  SUPPORTED_ADAPTERS,
  ATLAS_INFORMS,
  REPLACEMENT_SAFEGUARD
};
