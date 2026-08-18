/**
 * Classified numeric values (BR-144).
 * Unavailable stays null. Explicit source zero may be 0.
 */

const {
  VALUE_CLASSIFICATIONS,
  isKnownDollarClassification
} = require("./classifications");
const { createProvenance } = require("./provenance");

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function createClassifiedValue({
  value = null,
  classification = VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
  nullReason = null,
  provenance = null
} = {}) {
  const numeric = asFiniteNumber(value);
  const isUnavailable =
    classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE ||
    classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED;

  if (isUnavailable) {
    return Object.freeze({
      value: null,
      classification,
      nullReason: nullReason || "not_stated",
      invented: false,
      interpolated: false,
      provenance: provenance || null
    });
  }

  if (numeric == null) {
    return Object.freeze({
      value: null,
      classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
      nullReason: nullReason || "not_stated",
      invented: false,
      interpolated: false,
      provenance: provenance || null
    });
  }

  return Object.freeze({
    value: numeric,
    classification,
    nullReason: null,
    invented: false,
    interpolated: false,
    provenance: provenance || null
  });
}

function unavailableValue(nullReason, provenance = null) {
  return createClassifiedValue({
    value: null,
    classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
    nullReason,
    provenance
  });
}

function extractedExact(value, provenance = null, { nullReason = "not_stated" } = {}) {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return unavailableValue(nullReason, provenance);
  }
  return createClassifiedValue({
    value: numeric,
    classification: VALUE_CLASSIFICATIONS.EXTRACTED_EXACT,
    provenance
  });
}

function calculatedFromExplicitTerms(value, provenance = null, { nullReason = "not_stated" } = {}) {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return unavailableValue(nullReason, provenance);
  }
  return createClassifiedValue({
    value: numeric,
    classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
    provenance
  });
}

function carrierCalculationRequired(nullReason, provenance = null) {
  return createClassifiedValue({
    value: null,
    classification: VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED,
    nullReason,
    provenance
  });
}

/**
 * Sum only known dollar classifications. All-null / unavailable → null, never 0.
 */
function sumKnownDollarValues(items = [], provenance = null) {
  const known = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .filter(
      (item) =>
        isKnownDollarClassification(item.classification) &&
        typeof item.value === "number" &&
        Number.isFinite(item.value)
    );

  if (!known.length) {
    return unavailableValue("all_source_values_unavailable", provenance);
  }

  const total = known.reduce((sum, item) => sum + item.value, 0);
  return createClassifiedValue({
    value: total,
    classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
    provenance: provenance || createProvenance({
      classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
      section: "sum_of_known_dollar_fields"
    })
  });
}

function fromRawNumber(value, { explicitZero = true, nullReason = "not_stated", provenance = null } = {}) {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return unavailableValue(nullReason, provenance);
  }
  if (numeric === 0 && !explicitZero) {
    return unavailableValue(nullReason, provenance);
  }
  return extractedExact(numeric, provenance, { nullReason });
}

module.exports = {
  asFiniteNumber,
  createClassifiedValue,
  unavailableValue,
  extractedExact,
  calculatedFromExplicitTerms,
  carrierCalculationRequired,
  sumKnownDollarValues,
  fromRawNumber
};
