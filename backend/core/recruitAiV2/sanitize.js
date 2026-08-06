/**
 * Recruit AI v2 — prevent internal diagnostic leakage in customer copy.
 */

const { INTERNAL_DIAGNOSTIC_PATTERNS } = require("./constants");

function containsInternalDiagnostics(text) {
  const sample = String(text || "");
  return INTERNAL_DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(sample));
}

function sanitizeCustomerCopy(text, fallback) {
  const value = String(text || "").trim();
  if (!value) {
    return fallback;
  }

  if (containsInternalDiagnostics(value)) {
    return fallback;
  }

  return value;
}

module.exports = {
  containsInternalDiagnostics,
  sanitizeCustomerCopy
};
