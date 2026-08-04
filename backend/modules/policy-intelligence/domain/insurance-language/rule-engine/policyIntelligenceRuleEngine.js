/**
 * Deterministic Policy Intelligence Rule Engine (Sprint 3).
 *
 * READS immutable Insurance Facts.
 * NEVER modifies Facts.
 * PRODUCES Findings (+ optional Recommendations metadata) with evidence.
 * No OCR. No AI reasoning. No LLM decisions.
 */

const { readInsuranceFacts } = require("../InsuranceFacts");
const { resolveRuleThresholds } = require("./ruleThresholds");
const { INITIAL_RULE_LIBRARY, getRuleById } = require("./rules/initialRuleLibrary");
const { RULE_CATEGORIES } = require("./ruleCategories");

/**
 * Execute the rule library against immutable Insurance Facts.
 */
function executePolicyIntelligenceRules(facts, options = {}) {
  const started = process.hrtime.bigint();
  const readable = readInsuranceFacts(facts);
  const thresholds = resolveRuleThresholds(options.thresholds || {});
  const library = options.rules || INITIAL_RULE_LIBRARY;

  const rulesExecuted = [];
  const rulesPassed = [];
  const rulesTriggered = [];
  const findings = [];

  for (const rule of library) {
    rulesExecuted.push(rule.id);

    const result = rule.evaluate(readable, thresholds) || {
      triggered: false,
      finding: null
    };

    if (result.triggered && result.finding) {
      rulesTriggered.push(rule.id);
      findings.push(result.finding);
    } else {
      rulesPassed.push(rule.id);
    }
  }

  const ended = process.hrtime.bigint();
  const executionTimeMs = Number(ended - started) / 1e6;

  const recommendations = Object.freeze(
    findings
      .filter((finding) => finding.recommendation)
      .map((finding) =>
        Object.freeze({
          layer: "recommendations",
          ruleId: finding.ruleId,
          label: finding.recommendation,
          basedOnFindings: Object.freeze([finding.ruleId]),
          derived: true,
          source: "policy_intelligence_rule_engine"
        })
      )
  );

  return Object.freeze({
    insuranceFacts: readable,
    findings: Object.freeze(findings),
    recommendations,
    execution: Object.freeze({
      rulesExecuted: Object.freeze([...rulesExecuted]),
      rulesPassed: Object.freeze([...rulesPassed]),
      rulesTriggered: Object.freeze([...rulesTriggered]),
      rulesExecutedCount: rulesExecuted.length,
      rulesPassedCount: rulesPassed.length,
      rulesTriggeredCount: rulesTriggered.length,
      executionTimeMs: Number(executionTimeMs.toFixed(3)),
      thresholds: Object.freeze({ ...thresholds }),
      engine: "policy_intelligence_rule_engine",
      version: "1.0"
    })
  });
}

function listPolicyIntelligenceRules() {
  return INITIAL_RULE_LIBRARY.map((rule) =>
    Object.freeze({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      severity: rule.severity,
      inputs: rule.inputs,
      finding: rule.finding,
      recommendation: rule.recommendation,
      explanation: rule.explanation
    })
  );
}

module.exports = {
  executePolicyIntelligenceRules,
  listPolicyIntelligenceRules,
  getRuleById,
  RULE_CATEGORIES,
  INITIAL_RULE_LIBRARY
};
