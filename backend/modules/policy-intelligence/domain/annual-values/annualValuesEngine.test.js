/**
 * Sprint 4A — Annual Values Engine tests (BR-060).
 * Uses F&G illustration fixture as the primary validation dataset.
 */

const { analyzeAnnualValues, getAnnualValuesCatalog } = require("./annualValuesEngine");
const { FG_ILLUSTRATION_ANNUAL_VALUES } = require("./fixtures/fgIllustrationAnnualValues");
const { buildInsuranceFactsFromExtract } = require("../insurance-language/InsuranceFacts");
const { executePolicyIntelligenceRules } = require("../insurance-language/rule-engine/policyIntelligenceRuleEngine");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nearlyEqual(a, b, epsilon = 0.001) {
  return Math.abs(a - b) <= epsilon;
}

function run() {
  const catalog = getAnnualValuesCatalog();
  assert(catalog.canonicalFields.includes("policyYear"), "catalog has policyYear");
  assert(catalog.canonicalFields.includes("netCashValue"), "catalog has netCashValue");
  assert(catalog.contracts.factsImmutable === true, "facts immutable contract");
  assert(catalog.contracts.ruleEngineUntouched === true, "rule engine untouched contract");

  const fixture = FG_ILLUSTRATION_ANNUAL_VALUES;
  assert(fixture.carrier === "F&G", "F&G fixture carrier");
  assert(fixture.rows.length === 55, "F&G fixture year count");

  const analysis = analyzeAnnualValues(fixture.rows, {
    reviewId: "review-fg-1",
    source: "fg_illustration_fixture"
  });

  // Timeline normalized
  assert(analysis.timeline.length === 55, "timeline normalized from F&G rows");
  assert(analysis.timeline[0].policyYear === 1, "first year is 1");
  assert(analysis.timeline[0].insuredAge === 41, "EOY1 age = issueAge+1");
  assert(analysis.timeline.every((row) => row.policyYear != null), "every row has policyYear");

  // Canonical fields present; missing never invented beyond netCashValue derivation
  const sample = analysis.timeline[0];
  assert(typeof sample.annualPremium === "number", "premium numeric");
  assert(typeof sample.cashValue === "number", "cash value numeric");
  assert(typeof sample.deathBenefit === "number", "death benefit numeric");
  assert(typeof sample.netCashValue === "number", "net cash derived");
  assert(sample.loanBalance === 0, "loan balance present");

  // Validation
  assert(analysis.validationResults.valid === true, "F&G timeline validates");
  assert(analysis.validationResults.checks.sequentialPolicyYears === true, "years sequential");
  assert(analysis.validationResults.checks.agesIncreaseCorrectly === true, "ages increase");
  assert(analysis.validationResults.checks.premiumsNumericOrNull === true, "premiums numeric");
  assert(analysis.validationResults.checks.cashValuesNumericOrNull === true, "cash numeric");
  assert(analysis.validationResults.checks.deathBenefitsNumericOrNull === true, "DB numeric");

  // Deterministic calculations
  const metrics = analysis.summaryMetrics;
  assert(metrics.totalPremiumsPaid === 12000 * 20, "total premiums = 20 years * 12000");
  assert(metrics.totalCostOfInsurance > 0, "total COI > 0");
  assert(metrics.totalAdministrativeCharges > 0, "total admin > 0");
  assert(metrics.totalRiderCharges > 0, "total riders > 0");
  assert(
    nearlyEqual(
      metrics.totalInternalCharges,
      metrics.totalCostOfInsurance +
        metrics.totalAdministrativeCharges +
        metrics.totalRiderCharges +
        metrics.totalPremiumLoads
    ),
    "internal charges formula"
  );
  assert(typeof metrics.cashValueAtAge65 === "number", "CV@65");
  assert(typeof metrics.cashValueAtAge70 === "number", "CV@70");
  assert(typeof metrics.cashValueAtAge80 === "number", "CV@80");
  assert(typeof metrics.cashValueAtAge90 === "number", "CV@90");
  assert(metrics.cashValueAtAge70 >= metrics.cashValueAtAge65, "CV grows 65→70 in fixture");
  assert(metrics.policyDuration === 55, "policy duration");
  assert(
    metrics.breakEvenYear == null || Number.isInteger(metrics.breakEvenYear),
    "break-even year null or integer"
  );

  // Metadata
  assert(analysis.calculationMetadata.deterministic === true, "deterministic metadata");
  assert(analysis.calculationMetadata.ai === false, "no AI");
  assert(analysis.calculationMetadata.ocr === false, "no OCR");
  assert(analysis.meta.modifiesInsuranceFacts === false, "does not modify facts");
  assert(analysis.meta.modifiesRuleEngine === false, "does not modify rule engine");

  // Idempotent / deterministic second run
  const again = analyzeAnnualValues(fixture.rows, { reviewId: "review-fg-1" });
  assert(
    JSON.stringify(again.summaryMetrics) === JSON.stringify(analysis.summaryMetrics),
    "summary metrics deterministic"
  );
  assert(
    JSON.stringify(again.timeline) === JSON.stringify(analysis.timeline),
    "timeline deterministic"
  );

  // Validation failure: non-sequential years
  const bad = analyzeAnnualValues([
    { policyYear: 1, insuredAge: 40, annualPremium: 100, cashValue: 50, deathBenefit: 1000 },
    { policyYear: 3, insuredAge: 42, annualPremium: 100, cashValue: 80, deathBenefit: 1000 }
  ]);
  assert(bad.validationResults.valid === false, "non-sequential fails validation");
  assert(
    bad.validationResults.errors.some((error) => error.code === "POLICY_YEAR_NOT_SEQUENTIAL"),
    "sequential error code"
  );

  // Missing values stay null (never guessed)
  const sparse = analyzeAnnualValues([
    { Year: 1, Age: 45, "Premium Outlay": 5000, "Death Benefit": 250000 }
  ]);
  assert(sparse.timeline[0].cashValue === null, "missing cashValue is null");
  assert(sparse.timeline[0].costOfInsurance === null, "missing COI is null");
  assert(sparse.summaryMetrics.cashValueAtAge65 === null, "missing age milestone is null");

  // Insurance Facts remain independent / immutable; Rule Engine untouched by this module
  const facts = buildInsuranceFactsFromExtract({
    carrier: "F&G",
    productType: "IUL",
    insured: { issueAge: 40, gender: "Male", underwritingClass: "Preferred NT" },
    faceAmount: 500000,
    premium: { amount: 12000 }
  });
  const before = JSON.stringify(facts);
  analyzeAnnualValues(fixture.rows);
  assert(JSON.stringify(facts) === before, "analyzing annual values does not mutate facts");

  const ruleResult = executePolicyIntelligenceRules(facts);
  assert(ruleResult.execution.rulesExecutedCount === 10, "rule engine still executes PI library");

  console.log("annualValuesEngine.test.js (BR-060 / F&G) passed");
}

run();
