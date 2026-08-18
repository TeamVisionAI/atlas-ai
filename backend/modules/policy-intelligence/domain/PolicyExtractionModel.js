/**
 * Canonical PolicyExtraction model (schemaVersion 2.0).
 * Implements BR-052, BR-054, BR-056 (CRM / Policy Intelligence boundary).
 *
 * CRM owns people & policy numbers.
 * Policy Intelligence owns policy mechanics (anonymous insurance characteristics).
 */

const {
  POLICY_EXTRACTION_SCHEMA_VERSION,
  POLICY_EXTRACTION_METHODS,
  FORBIDDEN_PII_KEYS
} = require("./constants");
const { mapToAtlasTerm } = require("./insurance-language/insuranceVocabulary");

const FORBIDDEN_KEY_SET = new Set(
  FORBIDDEN_PII_KEYS.map((key) => key.toLowerCase())
);

function emptyInsured() {
  return {
    gender: null,
    issueAge: null,
    underwritingClass: null,
    riskClassification: null,
    tobaccoStatus: null
  };
}

function emptyPremium() {
  return {
    amount: null,
    currency: "USD",
    frequency: null
  };
}

function createEmptyPolicyExtractionData() {
  return {
    schemaVersion: POLICY_EXTRACTION_SCHEMA_VERSION,
    carrier: null,
    productType: null,
    product: null,
    insured: emptyInsured(),
    premium: emptyPremium(),
    faceAmount: null,
    paymentMode: null,
    deathBenefitOption: null,
    illustratedRate: null,
    guaranteedRate: null,
    illustratedDuration: null,
    guaranteedDuration: null,
    charges: [],
    cashValues: [],
    coi: null,
    indexes: [],
    loans: [],
    withdrawals: [],
    riders: [],
    coverages: [],
    policyYears: null,
    // Sprint 4A — raw annual illustration table (Annual Values Engine input).
    // Not Insurance Facts; normalized separately (BR-060).
    annualValues: [],
    // Findings / recommendations are derived by the Insurance Language Layer (BR-057).
    // They are never accepted as extract facts.
    findings: [],
    recommendations: [],
    mechanics: {}
  };
}

function asTrimmedString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asIssueAge(value) {
  const age = asNumber(value);

  if (age === null) {
    return null;
  }

  if (age < 0 || age > 120) {
    return null;
  }

  return Math.round(age);
}

function isForbiddenKey(key) {
  return FORBIDDEN_KEY_SET.has(String(key || "").toLowerCase());
}

function stripForbiddenKeys(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return {};
  }

  const next = {};

  for (const [key, value] of Object.entries(object)) {
    if (isForbiddenKey(key) || value === undefined) {
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = stripForbiddenKeys(value);
      if (Object.keys(nested).length > 0) {
        next[key] = nested;
      }
      continue;
    }

    next[key] = value;
  }

  return next;
}

function normalizeCoverage(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const type = asTrimmedString(entry.type);

  if (!type) {
    return null;
  }

  return {
    type,
    limit: asTrimmedString(entry.limit) || asNumber(entry.limit),
    deductible: asTrimmedString(entry.deductible) || asNumber(entry.deductible),
    notes: asTrimmedString(entry.notes)
  };
}

function normalizeCharge(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const type = asTrimmedString(entry.type || entry.name);

  if (!type || isForbiddenKey(type)) {
    return null;
  }

  return {
    type,
    amount: asNumber(entry.amount),
    frequency: asTrimmedString(entry.frequency)
  };
}

function normalizeCashValue(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    year: asNumber(entry.year),
    amount: asNumber(entry.amount ?? entry.value)
  };
}

function normalizeIndex(entry) {
  if (typeof entry === "string") {
    const name = asTrimmedString(entry);
    return name ? { name } : null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const name = asTrimmedString(entry.name || entry.type);
  if (!name) {
    return null;
  }

  return {
    name,
    participationRate: asNumber(entry.participationRate),
    cap: asNumber(entry.cap),
    floor: asNumber(entry.floor)
  };
}

function normalizeRider(entry) {
  if (typeof entry === "string") {
    const type = asTrimmedString(entry);
    return type ? { type } : null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const type = asTrimmedString(entry.type || entry.name);
  if (!type) {
    return null;
  }

  return {
    type,
    amount: asNumber(entry.amount),
    notes: asTrimmedString(entry.notes),
    name: asTrimmedString(entry.name) || type,
    qualifyingTrigger: asTrimmedString(entry.qualifyingTrigger),
    maximumAccelerationPercent: asNumber(entry.maximumAccelerationPercent),
    maximumDollarAmount: asNumber(entry.maximumDollarAmount),
    minimumDollarAmount: asNumber(entry.minimumDollarAmount),
    discountFactor: asNumber(entry.discountFactor),
    discountMethodology: asTrimmedString(entry.discountMethodology),
    amountOfDeathBenefitAccelerated: asNumber(entry.amountOfDeathBenefitAccelerated),
    estimatedActualCashBenefit: asNumber(entry.estimatedActualCashBenefit),
    remainingDeathBenefit:
      asTrimmedString(entry.remainingDeathBenefit) || asNumber(entry.remainingDeathBenefit),
    effectOnCashValue: asTrimmedString(entry.effectOnCashValue),
    monthlyLimit: asNumber(entry.monthlyLimit),
    annualLimitPercent: asNumber(entry.annualLimitPercent),
    annualLimitDollars: asNumber(entry.annualLimitDollars),
    riderCharges: entry.riderCharges && typeof entry.riderCharges === "object" ? entry.riderCharges : null,
    sourcePage: asNumber(entry.sourcePage),
    calculated: entry.calculated === true,
    formNumber: asTrimmedString(entry.formNumber),
    formNumbers: Array.isArray(entry.formNumbers)
      ? entry.formNumbers.map((value) => asTrimmedString(value)).filter(Boolean)
      : null,
    adapterKey: asTrimmedString(entry.adapterKey),
    payoutClassification: asTrimmedString(entry.payoutClassification),
    discountSampleInterestRate: asNumber(entry.discountSampleInterestRate),
    discountSampleNote: asTrimmedString(entry.discountSampleNote),
    cashReceivedNotEqualToAmountAccelerated: entry.cashReceivedNotEqualToAmountAccelerated === true,
    monthlyLimitPercent: asNumber(entry.monthlyLimitPercent)
  };
}

function normalizeLoan(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    balance: asNumber(entry.balance ?? entry.amount),
    interestRate: asNumber(entry.interestRate),
    notes: asTrimmedString(entry.notes)
  };
}

function normalizeTextItem(entry) {
  if (typeof entry === "string") {
    return asTrimmedString(entry);
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  // Reject ownership/name-shaped payloads.
  if (
    entry.name ||
    entry.firstName ||
    entry.lastName ||
    entry.clientName ||
    entry.ownerName ||
    entry.beneficiaryName
  ) {
    return null;
  }

  return asTrimmedString(entry.text || entry.code || entry.rule || entry.finding || entry.recommendation);
}

function normalizeInsured(source = {}) {
  const insuredSource =
    source.insured && typeof source.insured === "object" ? source.insured : source;

  const underwritingClass = mapToAtlasTerm(
    insuredSource.underwritingClass || insuredSource.riskClassification,
    "riskClassification"
  );

  return {
    gender: asTrimmedString(insuredSource.gender),
    issueAge: asIssueAge(insuredSource.issueAge),
    underwritingClass,
    riskClassification: underwritingClass,
    tobaccoStatus: mapToAtlasTerm(insuredSource.tobaccoStatus, "tobaccoStatus")
  };
}

/**
 * Normalize into zero-knowledge canonical PolicyExtraction payload.
 * Strips all forbidden PII keys. Does not invent values (no AI).
 */
function normalizePolicyExtractionData(input = {}) {
  const base = createEmptyPolicyExtractionData();
  const source = input && typeof input === "object" ? stripForbiddenKeys(input) : {};

  base.carrier = asTrimmedString(source.carrier);
  base.productType = mapToAtlasTerm(source.productType || source.product, "productType");
  base.product = asTrimmedString(source.product) || base.productType;
  base.insured = normalizeInsured(source);

  const premium = source.premium && typeof source.premium === "object" ? source.premium : {};
  base.premium = {
    amount: asNumber(premium.amount),
    currency: asTrimmedString(premium.currency) || "USD",
    frequency: asTrimmedString(premium.frequency)
  };

  base.faceAmount = asNumber(source.faceAmount);
  base.paymentMode = asTrimmedString(source.paymentMode || premium.frequency);
  base.deathBenefitOption = mapToAtlasTerm(source.deathBenefitOption, "deathBenefitOption");
  base.illustratedRate = asNumber(source.illustratedRate);
  base.guaranteedRate = asNumber(source.guaranteedRate);
  base.illustratedDuration = asNumber(source.illustratedDuration);
  base.guaranteedDuration = asNumber(source.guaranteedDuration);
  base.policyYears = asNumber(source.policyYears);
  base.coi =
    source.coi && typeof source.coi === "object"
      ? {
          amount: asNumber(source.coi.amount),
          frequency: asTrimmedString(source.coi.frequency)
        }
      : asNumber(source.coi) != null
        ? { amount: asNumber(source.coi), frequency: null }
        : null;

  base.charges = Array.isArray(source.charges)
    ? source.charges.map(normalizeCharge).filter(Boolean)
    : [];
  base.cashValues = Array.isArray(source.cashValues)
    ? source.cashValues.map(normalizeCashValue).filter(Boolean)
    : [];
  base.indexes = Array.isArray(source.indexes)
    ? source.indexes.map(normalizeIndex).filter(Boolean)
    : [];
  base.loans = Array.isArray(source.loans)
    ? source.loans.map(normalizeLoan).filter(Boolean)
    : [];
  base.riders = Array.isArray(source.riders)
    ? source.riders.map((rider) => {
        const normalized = normalizeRider(rider);
        if (!normalized) {
          return null;
        }
        return {
          ...normalized,
          type: mapToAtlasTerm(normalized.type, "rider") || normalized.type
        };
      }).filter(Boolean)
    : [];
  base.coverages = Array.isArray(source.coverages)
    ? source.coverages.map(normalizeCoverage).filter(Boolean)
    : [];
  base.withdrawals = Array.isArray(source.withdrawals)
    ? source.withdrawals
        .map((row) =>
          row && typeof row === "object"
            ? {
                amount: asNumber(row.amount),
                year: asNumber(row.year),
                notes: asTrimmedString(row.notes)
              }
            : null
        )
        .filter(Boolean)
    : [];

  // BR-060: preserve raw annual table rows for Annual Values Engine (not Facts).
  base.annualValues = Array.isArray(source.annualValues)
    ? source.annualValues
        .filter((row) => row && typeof row === "object" && !Array.isArray(row))
        .map((row) => stripForbiddenKeys(row))
    : Array.isArray(source.annual_values)
      ? source.annual_values
          .filter((row) => row && typeof row === "object" && !Array.isArray(row))
          .map((row) => stripForbiddenKeys(row))
      : [];

  // BR-057: findings/recommendations are derived — never accepted as extract facts.
  base.findings = [];
  base.recommendations = [];

  const mechanicsSource =
    source.mechanics && typeof source.mechanics === "object" ? source.mechanics : {};
  const knownKeys = new Set([
    "schemaVersion",
    "carrier",
    "productType",
    "product",
    "insured",
    "premium",
    "faceAmount",
    "paymentMode",
    "deathBenefitOption",
    "illustratedRate",
    "guaranteedRate",
    "illustratedDuration",
    "guaranteedDuration",
    "policyYears",
    "charges",
    "cashValues",
    "coi",
    "indexes",
    "loans",
    "withdrawals",
    "riders",
    "coverages",
    "annualValues",
    "annual_values",
    "findings",
    "recommendations",
    "insuranceFacts",
    "languageLayer",
    "businessRules",
    "mechanics",
    // CRM / PII keys intentionally ignored / stripped (BR-056)
    "policyNumber",
    "effectiveDate",
    "expirationDate",
    "namedInsureds",
    "beneficiaries",
    "rawFields",
    "prospectId",
    "ownerName",
    "clientName",
    "policyHolderName"
  ]);

  const mechanics = stripForbiddenKeys(mechanicsSource);

  for (const [key, value] of Object.entries(source)) {
    if (!knownKeys.has(key) && value !== undefined && !isForbiddenKey(key)) {
      mechanics[key] = value;
    }
  }

  base.mechanics = mechanics;
  base.schemaVersion = POLICY_EXTRACTION_SCHEMA_VERSION;

  return base;
}

function hasExtractedIdentity(data) {
  return Boolean(
    data &&
      (data.carrier ||
        data.productType ||
        data.product ||
        data.faceAmount != null ||
        data.premium?.amount != null ||
        data.insured?.gender ||
        data.insured?.issueAge != null ||
        data.insured?.underwritingClass ||
        data.insured?.tobaccoStatus ||
        (Array.isArray(data.coverages) && data.coverages.length > 0) ||
        (Array.isArray(data.riders) && data.riders.length > 0) ||
        (Array.isArray(data.charges) && data.charges.length > 0))
  );
}

/**
 * Deterministic non-PII hints from mime/type only — never policy numbers or names.
 */
function buildRulesHintsFromDocument({ fileName, mimeType } = {}) {
  const hints = {
    mimeType: asTrimmedString(mimeType),
    hasFileName: Boolean(asTrimmedString(fileName)),
    // Deliberately omit raw fileName (may contain person/policy identifiers).
    suggestedProductType: null
  };

  const name = String(fileName || "").toLowerCase();

  if (name.includes("iul") || name.includes("indexed")) {
    hints.suggestedProductType = "Indexed Universal Life";
  } else if (name.includes("term")) {
    hints.suggestedProductType = "Term Life";
  } else if (name.includes("whole")) {
    hints.suggestedProductType = "Whole Life";
  } else if (name.includes("vul") || name.includes("variable")) {
    hints.suggestedProductType = "Variable Universal Life";
  }

  return hints;
}

function applyRulesHints(data, hints = {}) {
  const next = normalizePolicyExtractionData(data);

  if (!next.productType && hints.suggestedProductType) {
    next.productType = hints.suggestedProductType;
    next.product = hints.suggestedProductType;
    next.mechanics = {
      ...next.mechanics,
      productTypeSource: "filename_rules"
    };
  }

  return next;
}

function resolveExtractionMethod(inputProvided, rulesApplied) {
  if (inputProvided) {
    return POLICY_EXTRACTION_METHODS.STRUCTURED_INGEST;
  }

  if (rulesApplied) {
    return POLICY_EXTRACTION_METHODS.RULES;
  }

  return POLICY_EXTRACTION_METHODS.STRUCTURED_INGEST;
}

/**
 * Payload safe for AI prompts, embeddings, benchmarks, and shared analytics.
 * Contains ONLY canonical insurance mechanics — never CRM IDs or PII.
 */
function toIntelligencePayload(extractedData) {
  return normalizePolicyExtractionData(extractedData || {});
}

module.exports = {
  createEmptyPolicyExtractionData,
  normalizePolicyExtractionData,
  hasExtractedIdentity,
  buildRulesHintsFromDocument,
  applyRulesHints,
  resolveExtractionMethod,
  toIntelligencePayload,
  stripForbiddenKeys,
  isForbiddenKey
};
