/**
 * Sprint 3 — Deterministic Policy Intelligence Rule Engine tests (BR-059).
 * Every rule PI-001…PI-010 is independently testable.
 */

const { buildInsuranceFactsFromExtract } = require("../InsuranceFacts");
const { ATLAS_TERMS } = require("../insuranceVocabulary");
const {
  executePolicyIntelligenceRules,
  getRuleById,
  INITIAL_RULE_LIBRARY
} = require("./policyIntelligenceRuleEngine");
const { DEFAULT_RULE_THRESHOLDS } = require("./ruleThresholds");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function factsFrom(partial) {
  return buildInsuranceFactsFromExtract(partial, { extractionId: "rule-test" });
}

function runRule(ruleId, partial, thresholds) {
  const rule = getRuleById(ruleId);
  assert(rule, `rule ${ruleId} exists`);
  const facts = factsFrom(partial);
  return rule.evaluate(facts, { ...DEFAULT_RULE_THRESHOLDS, ...(thresholds || {}) });
}

function run() {
  assert(INITIAL_RULE_LIBRARY.length === 10, "library has PI-001…PI-010");
  assert(
    INITIAL_RULE_LIBRARY.every((rule) => rule.id && rule.category && typeof rule.evaluate === "function"),
    "every rule has id, category, evaluate"
  );

  // PI-001 Carrier Identified
  assert(runRule("PI-001", { carrier: "Acme" }).triggered === true, "PI-001 triggers with carrier");
  assert(runRule("PI-001", { carrier: null }).triggered === false, "PI-001 passes without carrier");

  // PI-002 Product Identified
  assert(
    runRule("PI-002", { productType: "IUL" }).triggered === true,
    "PI-002 triggers with productType"
  );
  assert(runRule("PI-002", {}).triggered === false, "PI-002 passes without product");

  // PI-003 Increasing Death Benefit
  const pi003 = runRule("PI-003", { deathBenefitOption: "Option B" });
  assert(pi003.triggered === true, "PI-003 triggers on Option B");
  assert(
    pi003.finding.evidence.deathBenefitOption === ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "PI-003 evidence uses Atlas term"
  );
  assert(
    runRule("PI-003", { deathBenefitOption: "Option A" }).triggered === false,
    "PI-003 does not fire on Option A"
  );

  // PI-004 Level Death Benefit
  assert(
    runRule("PI-004", { deathBenefitOption: "Option A" }).triggered === true,
    "PI-004 triggers on Option A"
  );
  assert(
    runRule("PI-004", { deathBenefitOption: "Option B" }).triggered === false,
    "PI-004 does not fire on Option B"
  );

  // PI-005 High Illustration Dependency (duration gap)
  const pi005 = runRule(
    "PI-005",
    { illustratedDuration: 40, guaranteedDuration: 20 },
    { illustrationDurationGapYears: 10 }
  );
  assert(pi005.triggered === true, "PI-005 triggers on duration gap");
  assert(pi005.finding.severity === "High", "PI-005 severity High");
  assert(
    pi005.finding.recommendation === "Perform lower-interest stress testing.",
    "PI-005 recommendation"
  );
  assert(
    runRule(
      "PI-005",
      { illustratedDuration: 25, guaranteedDuration: 20 },
      { illustrationDurationGapYears: 10 }
    ).triggered === false,
    "PI-005 respects threshold"
  );

  // PI-005 rate fallback
  assert(
    runRule("PI-005", { illustratedRate: 6, guaranteedRate: 2 }, { illustrationRateGapPoints: 2 })
      .triggered === true,
    "PI-005 rate fallback triggers"
  );

  // PI-006 Volatility-controlled index
  assert(
    runRule("PI-006", {
      indexes: [{ name: "S&P Volatility Control" }]
    }).triggered === true,
    "PI-006 triggers on vol-control index"
  );
  assert(
    runRule("PI-006", { indexes: [{ name: "S&P 500 Annual Point to Point" }] }).triggered ===
      false,
    "PI-006 passes on plain index"
  );

  // PI-007 Multiple riders
  assert(
    runRule("PI-007", {
      riders: [{ type: "ADB" }, { type: "Waiver" }]
    }).triggered === true,
    "PI-007 triggers on 2+ riders"
  );
  assert(
    runRule("PI-007", { riders: [{ type: "ADB" }] }, { multipleRidersMinimum: 2 }).triggered ===
      false,
    "PI-007 passes on single rider"
  );

  // PI-008 Indexed crediting
  assert(runRule("PI-008", { productType: "IUL" }).triggered === true, "PI-008 on IUL");
  assert(
    runRule("PI-008", { productType: "Term", indexes: [] }).triggered === false,
    "PI-008 passes on term without indexes"
  );

  // PI-009 Flexible premium
  assert(
    runRule("PI-009", { productType: "IUL", premium: { frequency: "monthly" } }).triggered ===
      true,
    "PI-009 on universal/IUL"
  );

  // PI-010 Required facts missing
  const pi010 = runRule("PI-010", { carrier: "Acme" });
  assert(pi010.triggered === true, "PI-010 triggers when required facts missing");
  assert(Array.isArray(pi010.finding.evidence.missing), "PI-010 lists missing keys");
  assert(
    runRule("PI-010", {
      carrier: "Acme",
      productType: "IUL",
      faceAmount: 100000,
      premium: { amount: 100 },
      insured: {
        issueAge: 40,
        gender: "Male",
        underwritingClass: "Preferred NT"
      }
    }).triggered === false,
    "PI-010 passes when required facts present"
  );

  // Engine metadata + immutability
  const full = executePolicyIntelligenceRules(
    factsFrom({
      carrier: "Acme",
      productType: "IUL",
      deathBenefitOption: "Option B",
      illustratedDuration: 40,
      guaranteedDuration: 20,
      insured: { issueAge: 40, gender: "Male", underwritingClass: "Preferred NT" },
      faceAmount: 250000,
      premium: { amount: 150, frequency: "monthly" },
      riders: [{ type: "ADB" }, { type: "Waiver" }],
      indexes: [{ name: "Buffered Index" }]
    })
  );

  assert(full.execution.rulesExecutedCount === 10, "rulesExecuted count");
  assert(full.execution.rulesTriggered.includes("PI-001"), "PI-001 in triggered");
  assert(full.execution.rulesTriggered.includes("PI-005"), "PI-005 in triggered");
  assert(
    full.execution.rulesPassedCount + full.execution.rulesTriggeredCount ===
      full.execution.rulesExecutedCount,
    "passed + triggered = executed"
  );
  assert(typeof full.execution.executionTimeMs === "number", "executionTime present");
  assert(
    full.findings.every(
      (finding) =>
        finding.ruleId &&
        finding.severity &&
        finding.finding &&
        finding.explanation &&
        finding.evidence &&
        Array.isArray(finding.evidence.factRefs)
    ),
    "finding contract complete"
  );

  let mutated = false;
  try {
    full.insuranceFacts.carrier = "X";
  } catch {
    mutated = true;
  }
  assert(mutated || full.insuranceFacts.carrier === "Acme", "engine does not mutate facts");

  console.log("policyIntelligenceRuleEngine.test.js (BR-059) passed");
}

run();
