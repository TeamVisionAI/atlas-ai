/**
 * Immutable Insurance Facts domain (BR-057 / BR-058).
 *
 * Facts are created only by Atlas Extract.
 * Business Rules and AI may READ facts and must NEVER modify them.
 */

const { mapToAtlasTerm } = require("./insuranceVocabulary");

const FACT_SOURCE = Object.freeze({
  ATLAS_EXTRACT: "atlas_extract"
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

/**
 * Build immutable Insurance Facts from Atlas Extract output.
 * Applies Insurance Language vocabulary normalization.
 */
function buildInsuranceFactsFromExtract(extractedData = {}, { extractionId = null } = {}) {
  const source = extractedData && typeof extractedData === "object" ? extractedData : {};
  const insured = source.insured && typeof source.insured === "object" ? source.insured : {};
  const premium = source.premium && typeof source.premium === "object" ? source.premium : {};
  const mechanics = source.mechanics && typeof source.mechanics === "object" ? source.mechanics : {};

  const riskClassification = mapToAtlasTerm(
    insured.riskClassification || insured.underwritingClass,
    "riskClassification"
  );
  const tobaccoStatus = mapToAtlasTerm(insured.tobaccoStatus, "tobaccoStatus");
  const productType = mapToAtlasTerm(source.productType || source.product, "productType");
  const deathBenefitOption = mapToAtlasTerm(
    source.deathBenefitOption || mechanics.deathBenefitOption,
    "deathBenefitOption"
  );

  const charges = Array.isArray(source.charges)
    ? source.charges.map((charge) => ({
        type: mapToAtlasTerm(charge?.type, "charge") || asString(charge?.type),
        amount: asNumber(charge?.amount),
        frequency: asString(charge?.frequency)
      }))
    : [];

  const riders = Array.isArray(source.riders)
    ? source.riders.map((rider) => ({
        type: mapToAtlasTerm(rider?.type, "rider") || asString(rider?.type),
        amount: asNumber(rider?.amount),
        notes: asString(rider?.notes)
      }))
    : [];

  const facts = {
    layer: "insurance_facts",
    immutable: true,
    source: FACT_SOURCE.ATLAS_EXTRACT,
    extractionId: extractionId || null,
    createdAt: new Date().toISOString(),
    carrier: asString(source.carrier),
    product: asString(source.product || productType),
    productType,
    issueAge: asNumber(insured.issueAge),
    gender: asString(insured.gender),
    riskClassification,
    tobaccoStatus,
    faceAmount: asNumber(source.faceAmount),
    premium: {
      amount: asNumber(premium.amount),
      currency: asString(premium.currency) || "USD",
      frequency: asString(premium.frequency)
    },
    paymentMode: asString(source.paymentMode || premium.frequency || mechanics.paymentMode),
    deathBenefitOption,
    illustratedRate: asNumber(source.illustratedRate ?? mechanics.illustratedRate),
    guaranteedRate: asNumber(source.guaranteedRate ?? mechanics.guaranteedRate),
    illustratedDuration: asNumber(
      source.illustratedDuration ?? mechanics.illustratedDuration
    ),
    guaranteedDuration: asNumber(
      source.guaranteedDuration ?? mechanics.guaranteedDuration
    ),
    charges,
    riders,
    coi:
      source.coi && typeof source.coi === "object"
        ? {
            label: mapToAtlasTerm("COI", "charge"),
            amount: asNumber(source.coi.amount),
            frequency: asString(source.coi.frequency)
          }
        : asNumber(source.coi) != null
          ? {
              label: mapToAtlasTerm("COI", "charge"),
              amount: asNumber(source.coi),
              frequency: null
            }
          : null,
    cashValues: Array.isArray(source.cashValues)
      ? source.cashValues.map((row) => ({
          year: asNumber(row?.year),
          amount: asNumber(row?.amount ?? row?.value)
        }))
      : [],
    indexes: Array.isArray(source.indexes)
      ? source.indexes.map((row) =>
          typeof row === "string"
            ? { name: asString(row) }
            : {
                name: asString(row?.name || row?.type),
                participationRate: asNumber(row?.participationRate),
                cap: asNumber(row?.cap),
                floor: asNumber(row?.floor)
              }
        )
      : [],
    loans: Array.isArray(source.loans)
      ? source.loans.map((row) => ({
          balance: asNumber(row?.balance ?? row?.amount),
          interestRate: asNumber(row?.interestRate),
          notes: asString(row?.notes)
        }))
      : [],
    withdrawals: Array.isArray(source.withdrawals)
      ? source.withdrawals.map((row) => ({
          amount: asNumber(row?.amount),
          year: asNumber(row?.year),
          notes: asString(row?.notes)
        }))
      : Array.isArray(mechanics.withdrawals)
        ? mechanics.withdrawals.map((row) => ({
            amount: asNumber(row?.amount),
            year: asNumber(row?.year),
            notes: asString(row?.notes)
          }))
        : [],
    policyYears: asNumber(source.policyYears ?? mechanics.policyYears),
    coverages: Array.isArray(source.coverages)
      ? source.coverages.map((row) => ({
          type: asString(row?.type),
          limit: row?.limit ?? null,
          deductible: row?.deductible ?? null
        }))
      : []
  };

  return deepFreeze(facts);
}

function assertInsuranceFactsImmutable(facts) {
  if (!facts || facts.immutable !== true || facts.source !== FACT_SOURCE.ATLAS_EXTRACT) {
    const error = new Error("Insurance Facts are invalid or not from Atlas Extract.");
    error.statusCode = 500;
    error.publicCode = "INSURANCE_FACTS_INVALID";
    throw error;
  }

  if (!Object.isFrozen(facts)) {
    const error = new Error("Insurance Facts must be immutable (BR-058).");
    error.statusCode = 500;
    error.publicCode = "INSURANCE_FACTS_MUTABLE";
    throw error;
  }

  return true;
}

/**
 * Business Rules / AI read path — returns a frozen clone; never a writable original.
 */
function readInsuranceFacts(facts) {
  assertInsuranceFactsImmutable(facts);
  return facts;
}

module.exports = {
  FACT_SOURCE,
  buildInsuranceFactsFromExtract,
  assertInsuranceFactsImmutable,
  readInsuranceFacts,
  deepFreeze
};
