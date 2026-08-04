/**
 * Business Rules adapter (Sprint 2 → Sprint 3).
 *
 * Preserves the frozen pipeline entrypoint while delegating to the
 * deterministic Policy Intelligence Rule Engine.
 *
 * READS Insurance Facts.
 * NEVER modifies Insurance Facts.
 * PRODUCES Findings (and rule-linked recommendation metadata).
 */

const {
  executePolicyIntelligenceRules
} = require("./rule-engine/policyIntelligenceRuleEngine");

/**
 * Evaluate deterministic rules against immutable facts.
 * @returns {ReadonlyArray<object>} findings
 */
function evaluateInsuranceBusinessRules(facts, options = {}) {
  const result = executePolicyIntelligenceRules(facts, options);
  return result.findings;
}

/**
 * Full rule-engine execution including metadata (Sprint 3).
 */
function executeInsuranceBusinessRules(facts, options = {}) {
  return executePolicyIntelligenceRules(facts, options);
}

module.exports = {
  evaluateInsuranceBusinessRules,
  executeInsuranceBusinessRules
};
