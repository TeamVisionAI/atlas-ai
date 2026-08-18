/**
 * Display-only helpers for BR-144 classified values.
 * Never coerce NOT_AVAILABLE / CARRIER_CALCULATION_REQUIRED to $0.
 */

export const VALUE_CLASSIFICATIONS = Object.freeze({
  EXTRACTED_EXACT: "EXTRACTED_EXACT",
  CALCULATED_FROM_EXPLICIT_TERMS: "CALCULATED_FROM_EXPLICIT_TERMS",
  NOT_AVAILABLE: "NOT_AVAILABLE",
  CARRIER_CALCULATION_REQUIRED: "CARRIER_CALCULATION_REQUIRED"
});

export const NOT_DISCLOSED = "Not disclosed in this illustration";
export const CARRIER_CALCULATION_LABEL = "Carrier-specific calculation required";
export const CALCULATED_FROM_TERMS = "Calculated from policy terms";
export const TABLE_UNAVAILABLE = "—";

export function formatUsd(value) {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  const useCents = !Number.isInteger(number) || Math.abs(number) < 1;
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: useCents ? 2 : 0,
    maximumFractionDigits: useCents ? 2 : 0
  });
}

export function classificationOf(classified) {
  if (!classified || typeof classified !== "object") {
    return VALUE_CLASSIFICATIONS.NOT_AVAILABLE;
  }
  return classified.classification || VALUE_CLASSIFICATIONS.NOT_AVAILABLE;
}

export function isUnavailableClassification(classification) {
  return (
    classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE ||
    classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
  );
}

/**
 * Card/copy rendering. Unavailable values never become "$0".
 */
export function formatClassifiedValue(classified) {
  const classification = classificationOf(classified);
  const rawValue = classified && typeof classified === "object" ? classified.value : null;

  if (classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED) {
    return {
      text: CARRIER_CALCULATION_LABEL,
      valueText: null,
      value: null,
      classification,
      caption: null
    };
  }

  if (classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE || rawValue == null) {
    return {
      text: NOT_DISCLOSED,
      valueText: null,
      value: null,
      classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
      caption: null
    };
  }

  return {
    text: formatUsd(rawValue),
    valueText: formatUsd(rawValue),
    value: rawValue,
    classification,
    caption:
      classification === VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS
        ? CALCULATED_FROM_TERMS
        : null
  };
}

/**
 * Compact table cell. Unavailable → em dash, never "$0".
 */
export function formatClassifiedTableCell(classified) {
  const formatted = formatClassifiedValue(classified);
  if (formatted.value == null) {
    return TABLE_UNAVAILABLE;
  }
  return formatted.valueText;
}

export function provenanceSummary(provenance) {
  if (!provenance || typeof provenance !== "object") {
    return null;
  }
  const parts = [];
  if (provenance.sourcePage != null) {
    parts.push(`Page ${provenance.sourcePage}`);
  }
  if (provenance.section) {
    parts.push(String(provenance.section).replace(/_/g, " "));
  }
  if (provenance.formNumber) {
    parts.push(provenance.formNumber);
  }
  if (provenance.formVersion) {
    parts.push(provenance.formVersion);
  }
  return parts.length ? parts.join(" · ") : null;
}
