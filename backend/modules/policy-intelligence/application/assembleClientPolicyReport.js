/**
 * Assemble the client-facing Policy Intelligence report from persisted DTOs (BR-144).
 * Does not parse PDFs. Does not invent costs, rider payouts, or investment series.
 */

const { ADAPTER_KEYS } = require("../domain/illustration-extract/detectIllustrationAdapter");
const {
  buildPolicyEconomicsReportDto,
  createEmptyPolicyCostTerms,
  fromRawNumber,
  createProvenance,
  VALUE_CLASSIFICATIONS
} = require("../domain/policy-economics");
const {
  buildReportCheckpoints,
  DEFAULT_CHECKPOINT_YEARS
} = require("../domain/illustration-extract/reportCheckpoints");

const SUPPORTED_ADAPTERS = new Set(Object.values(ADAPTER_KEYS));

const ATLAS_INFORMS =
  "Atlas informs. Representatives recommend. Clients decide.";
const REPLACEMENT_SAFEGUARD =
  "Do not cancel or surrender an existing policy before replacement coverage is approved and in force.";
const CARRIER_CALC_CAVEAT =
  "Some living-benefit amounts require a current carrier-specific calculation and underwriting review.";
const HYPOTHETICAL_CAVEAT =
  "Investment projections are hypothetical and not guaranteed.";
const DISTRIBUTION_SCENARIO_KEY = "current_illustrated_distributions";
const DISTRIBUTIONS_LEDGER_LABEL = "Distributions Ledger";

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

function extraCheckpointYears(timeline = []) {
  const years = (Array.isArray(timeline) ? timeline : [])
    .map((row) => Number(row?.policyYear))
    .filter((year) => Number.isInteger(year) && year > 0);
  if (!years.length) {
    return [];
  }
  const lastYear = Math.max(...years);
  return DEFAULT_CHECKPOINT_YEARS.includes(lastYear) ? [] : [lastYear];
}

function isExplicitNonzero(value) {
  if (value == null || value === "") {
    return false;
  }
  const number = Number(value);
  return Number.isFinite(number) && number !== 0;
}

function distributionStartYearFromRows(rows = []) {
  const sorted = [...rows].sort(
    (left, right) => Number(left.policyYear) - Number(right.policyYear)
  );
  for (const row of sorted) {
    if (isExplicitNonzero(row.income) || isExplicitNonzero(row.plannedLoan)) {
      return Number(row.policyYear);
    }
  }
  return null;
}

function classifyDistributionField(value, sourcePage, nullReason) {
  return fromRawNumber(value, {
    explicitZero: true,
    nullReason,
    provenance: createProvenance({
      sourcePage: sourcePage ?? null,
      section: DISTRIBUTION_SCENARIO_KEY,
      table: DISTRIBUTIONS_LEDGER_LABEL,
      classification:
        value == null || value === ""
          ? VALUE_CLASSIFICATIONS.NOT_AVAILABLE
          : VALUE_CLASSIFICATIONS.EXTRACTED_EXACT
    })
  });
}

function mapDistributionTimelineRow(row) {
  if (!row || row.policyYear == null) {
    return null;
  }
  return {
    policyYear: Number(row.policyYear),
    insuredAge: row.insuredAge ?? row.attainedAge ?? null,
    annualPremium: row.annualPremium ?? row.premium ?? null,
    income: row.income ?? null,
    plannedLoan: row.plannedLoan ?? null,
    accumulatedLoan: row.accumulatedLoan ?? null,
    accountValue: row.accountValue ?? row.accumulatedValue ?? null,
    cashSurrenderValue: row.cashSurrenderValue ?? null,
    deathBenefit: row.deathBenefit ?? row.netDeathBenefit ?? null,
    sourcePage: row.sourcePage ?? null,
    scenario: row.scenario || DISTRIBUTION_SCENARIO_KEY
  };
}

function buildDistributionScenario(metadata = {}) {
  const rawRows = metadata?.scenarios?.[DISTRIBUTION_SCENARIO_KEY];
  if (!Array.isArray(rawRows) || !rawRows.length) {
    return null;
  }

  const timeline = rawRows.map(mapDistributionTimelineRow).filter(Boolean);
  if (!timeline.length) {
    return null;
  }

  const distributionStartYear = distributionStartYearFromRows(timeline);
  const requestedYears = [...DEFAULT_CHECKPOINT_YEARS];
  if (distributionStartYear != null && !requestedYears.includes(distributionStartYear)) {
    requestedYears.push(distributionStartYear);
  }
  for (const year of extraCheckpointYears(timeline)) {
    if (!requestedYears.includes(year)) {
      requestedYears.push(year);
    }
  }
  requestedYears.sort((left, right) => left - right);

  const checkpoints = buildReportCheckpoints(timeline, requestedYears)
    .filter((point) => point.usedYear != null && point.row)
    .map((point) => {
      const row = point.row;
      const sourcePage = row.sourcePage ?? null;
      return Object.freeze({
        requestedYear: point.requestedYear,
        usedYear: point.usedYear,
        fallback: point.fallback === true,
        fallbackStep: point.fallbackStep,
        policyYear: point.usedYear,
        attainedAge: row.insuredAge ?? null,
        annualPremium: classifyDistributionField(row.annualPremium, sourcePage, "premium_not_on_distribution_year"),
        income: classifyDistributionField(row.income, sourcePage, "income_not_on_distribution_year"),
        plannedLoan: classifyDistributionField(row.plannedLoan, sourcePage, "planned_loan_not_on_distribution_year"),
        accumulatedLoan: classifyDistributionField(
          row.accumulatedLoan,
          sourcePage,
          "accumulated_loan_not_on_distribution_year"
        ),
        accountValue: classifyDistributionField(row.accountValue, sourcePage, "account_value_not_on_distribution_year"),
        cashSurrenderValue: classifyDistributionField(
          row.cashSurrenderValue,
          sourcePage,
          "csv_not_on_distribution_year"
        ),
        deathBenefit: classifyDistributionField(row.deathBenefit, sourcePage, "death_benefit_not_on_distribution_year"),
        sourcePage,
        scenario: row.scenario || DISTRIBUTION_SCENARIO_KEY
      });
    });

  if (!checkpoints.length) {
    return null;
  }

  return Object.freeze({
    scenario: DISTRIBUTION_SCENARIO_KEY,
    sourceLabel: DISTRIBUTIONS_LEDGER_LABEL,
    sourcePages: Object.freeze(collectStoredPages(timeline.map((row) => row.sourcePage))),
    distributionStartYear,
    checkpoints: Object.freeze(checkpoints)
  });
}

function annualChargeDetailUnavailable(economics) {
  const categories = economics?.policyCostCategories;
  if (!Array.isArray(categories) || !categories.length) {
    return false;
  }
  const coi = categories.find((category) => category.id === "cost_of_insurance");
  return coi?.display?.classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE;
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
    distributionScenario: buildDistributionScenario(metadata),
    chargeScheduleUndisclosed: annualChargeDetailUnavailable(economics),
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
  buildDistributionScenario,
  SUPPORTED_ADAPTERS,
  ATLAS_INFORMS,
  REPLACEMENT_SAFEGUARD,
  DISTRIBUTION_SCENARIO_KEY,
  DISTRIBUTIONS_LEDGER_LABEL
};
