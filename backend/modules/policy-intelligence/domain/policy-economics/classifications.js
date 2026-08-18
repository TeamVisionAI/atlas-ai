/**
 * Value / payout classification (BR-144).
 * Null/unavailable is never coerced to $0.
 */

const VALUE_CLASSIFICATIONS = Object.freeze({
  EXTRACTED_EXACT: "EXTRACTED_EXACT",
  CALCULATED_FROM_EXPLICIT_TERMS: "CALCULATED_FROM_EXPLICIT_TERMS",
  NOT_AVAILABLE: "NOT_AVAILABLE",
  CARRIER_CALCULATION_REQUIRED: "CARRIER_CALCULATION_REQUIRED"
});

const KNOWN_DOLLAR_CLASSIFICATIONS = Object.freeze([
  VALUE_CLASSIFICATIONS.EXTRACTED_EXACT,
  VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS
]);

const CARRIER_CALCULATION_REQUIRED_TEXT =
  "Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.";

function isKnownDollarClassification(classification) {
  return KNOWN_DOLLAR_CLASSIFICATIONS.includes(classification);
}

module.exports = {
  VALUE_CLASSIFICATIONS,
  KNOWN_DOLLAR_CLASSIFICATIONS,
  CARRIER_CALCULATION_REQUIRED_TEXT,
  isKnownDollarClassification
};
