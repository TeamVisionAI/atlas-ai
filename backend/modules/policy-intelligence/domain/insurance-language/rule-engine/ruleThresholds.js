/**
 * Configurable thresholds for Policy Intelligence rules (Sprint 3).
 * Deterministic — no AI. Override via executeRules({ thresholds }).
 */

const DEFAULT_RULE_THRESHOLDS = Object.freeze({
  /** PI-005: illustratedDuration - guaranteedDuration */
  illustrationDurationGapYears: 10,
  /** PI-005 alternate when only rates are present (percentage points) */
  illustrationRateGapPoints: 2,
  /** PI-007: minimum rider count to trigger */
  multipleRidersMinimum: 2,
  /** PI-010: required fact keys for a complete extract */
  requiredInsuranceFactKeys: Object.freeze([
    "carrier",
    "productType",
    "issueAge",
    "gender",
    "riskClassification",
    "faceAmount",
    "premium"
  ])
});

function resolveRuleThresholds(overrides = {}) {
  return {
    ...DEFAULT_RULE_THRESHOLDS,
    ...overrides,
    requiredInsuranceFactKeys:
      overrides.requiredInsuranceFactKeys || DEFAULT_RULE_THRESHOLDS.requiredInsuranceFactKeys
  };
}

module.exports = {
  DEFAULT_RULE_THRESHOLDS,
  resolveRuleThresholds
};
