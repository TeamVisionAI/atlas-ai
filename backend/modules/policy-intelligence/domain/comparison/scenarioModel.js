/**
 * Policy Intelligence Scenario model (Sprint 5 / BR-061).
 * A scenario packages pipeline outputs for comparison — never creates Facts.
 */

const SCENARIO_TYPES = Object.freeze({
  CURRENT_POLICY: "current_policy",
  STRESS_TEST: "stress_test",
  ALTERNATIVE_FUNDING: "alternative_funding",
  ALTERNATIVE_STRATEGY: "alternative_strategy",
  CUSTOM: "custom"
});

const SCENARIO_LABELS = Object.freeze({
  [SCENARIO_TYPES.CURRENT_POLICY]: "Current Policy",
  [SCENARIO_TYPES.STRESS_TEST]: "Stress Test",
  [SCENARIO_TYPES.ALTERNATIVE_FUNDING]: "Alternative Funding",
  [SCENARIO_TYPES.ALTERNATIVE_STRATEGY]: "Alternative Strategy",
  [SCENARIO_TYPES.CUSTOM]: "Custom"
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

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Build a frozen scenario snapshot from existing pipeline outputs.
 */
function createPolicyScenario({
  id,
  key = null,
  label = null,
  type = SCENARIO_TYPES.CUSTOM,
  insuranceFacts = null,
  annualValues = null,
  findings = [],
  recommendations = [],
  stress = null,
  metadata = {}
} = {}) {
  if (!id) {
    throw new Error("Scenario id is required.");
  }

  const typeValues = new Set(Object.values(SCENARIO_TYPES));
  const resolvedType = typeValues.has(type) ? type : SCENARIO_TYPES.CUSTOM;
  const resolvedLabel = label || SCENARIO_LABELS[resolvedType] || String(id);

  const timeline = Array.isArray(annualValues?.timeline)
    ? annualValues.timeline
    : Array.isArray(annualValues)
      ? annualValues
      : [];

  const summaryMetrics =
    annualValues?.summaryMetrics && typeof annualValues.summaryMetrics === "object"
      ? annualValues.summaryMetrics
      : {};

  return deepFreeze({
    id: String(id),
    key: key || String(id),
    label: resolvedLabel,
    type: resolvedType,
    insuranceFacts: cloneJson(insuranceFacts),
    annualValues: {
      timeline: cloneJson(timeline),
      summaryMetrics: cloneJson(summaryMetrics)
    },
    findings: cloneJson(Array.isArray(findings) ? findings : []),
    recommendations: cloneJson(Array.isArray(recommendations) ? recommendations : []),
    stress: stress ? cloneJson(stress) : null,
    metadata: {
      ...cloneJson(metadata || {}),
      createsFacts: false,
      source: "policy_intelligence_pipeline"
    }
  });
}

module.exports = {
  SCENARIO_TYPES,
  SCENARIO_LABELS,
  createPolicyScenario,
  cloneJson,
  deepFreeze
};
