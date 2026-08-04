/**
 * Standard Finding result produced by a Policy Intelligence rule (Sprint 3).
 */

function createRuleFinding({
  ruleId,
  name,
  category,
  severity,
  finding,
  recommendation = null,
  explanation,
  evidence = {},
  factRefs = []
}) {
  return Object.freeze({
    layer: "findings",
    ruleId,
    name,
    category,
    severity,
    finding,
    code: String(finding || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
    label: finding,
    recommendation,
    explanation,
    evidence: Object.freeze({
      ...evidence,
      factRefs: Object.freeze([...(factRefs || Object.keys(evidence || {}))])
    }),
    derived: true,
    source: "policy_intelligence_rule_engine"
  });
}

/**
 * Define a rule object with a standard shape.
 */
function defineRule({
  id,
  name,
  category,
  severity,
  inputs = [],
  recommendation = null,
  explanation,
  finding,
  evaluate
}) {
  if (!id || !name || !category || typeof evaluate !== "function") {
    throw new Error("Invalid Policy Intelligence rule definition.");
  }

  return Object.freeze({
    id,
    name,
    category,
    severity,
    inputs: Object.freeze([...inputs]),
    recommendation,
    explanation,
    finding,
    evaluate
  });
}

module.exports = {
  createRuleFinding,
  defineRule
};
