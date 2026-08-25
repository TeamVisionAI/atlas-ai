/**
 * Sprint 2 / 3 — Insurance Language Layer + Rule Engine tests (BR-057 / BR-058 / BR-059).
 */

const { mapToAtlasTerm, ATLAS_TERMS } = require("./insuranceVocabulary");
const {
  buildInsuranceFactsFromExtract,
  assertInsuranceFactsImmutable
} = require("./InsuranceFacts");
const { evaluateInsuranceBusinessRules } = require("./insuranceBusinessRulesEngine");
const { analyzeInsuranceLanguage, buildAiLanguageContext } = require("./languageLayer");
const { normalizePolicyExtractionData } = require("../PolicyExtractionModel");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  assert(
    mapToAtlasTerm("Preferred NT", "riskClassification") === ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "Preferred NT maps"
  );
  assert(
    mapToAtlasTerm("Preferred Nonsmoker", "riskClassification") ===
      ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "Preferred Nonsmoker maps"
  );
  assert(
    mapToAtlasTerm("Option B", "deathBenefitOption") === ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "Option B maps"
  );
  assert(mapToAtlasTerm("ADB", "rider") === ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT, "ADB maps");
  assert(mapToAtlasTerm("COI", "charge") === ATLAS_TERMS.COST_OF_INSURANCE, "COI maps");
  assert(
    mapToAtlasTerm("GPT", "complianceTest") === ATLAS_TERMS.GUIDELINE_PREMIUM_TEST,
    "GPT maps"
  );

  const extracted = normalizePolicyExtractionData({
    carrier: "Acme",
    productType: "IUL",
    deathBenefitOption: "Option B",
    illustratedRate: 6,
    guaranteedRate: 2,
    illustratedDuration: 40,
    guaranteedDuration: 20,
    insured: {
      gender: "Male",
      issueAge: 48,
      underwritingClass: "Preferred NT",
      tobaccoStatus: "Non-Tobacco"
    },
    premium: { amount: 200, frequency: "monthly" },
    faceAmount: 500000,
    coi: { amount: 90 },
    riders: [{ type: "ADB", amount: 60 }, { type: "Waiver" }, { type: "Child" }],
    indexes: [{ name: "S&P 500 Volatility Control" }],
    findings: ["SHOULD_BE_STRIPPED"],
    recommendations: ["SHOULD_BE_STRIPPED"]
  });

  assert(extracted.findings.length === 0, "client findings stripped from extract");
  assert(extracted.recommendations.length === 0, "client recommendations stripped");
  assert(
    extracted.insured.riskClassification === ATLAS_TERMS.PREFERRED_NON_SMOKER,
    "vocab on normalize"
  );

  const facts = buildInsuranceFactsFromExtract(extracted, { extractionId: "ex-1" });
  assertInsuranceFactsImmutable(facts);
  assert(facts.riders[0].type === ATLAS_TERMS.ACCELERATED_DEATH_BENEFIT, "ADB type mapped");
  assert(facts.riders[0].amount === 60, "rider amount kept");
  assert("payoutClassification" in facts.riders[0], "Facts keep rider economics fields");
  assert("discountMethodology" in facts.riders[0], "Facts do not collapse to type/amount/notes only");
  assert(facts.immutable === true, "facts marked immutable");
  assert(facts.source === "atlas_extract", "facts from extract only");
  assert(
    facts.deathBenefitOption === ATLAS_TERMS.INCREASING_DEATH_BENEFIT,
    "facts use Atlas death benefit term"
  );

  let threw = false;
  try {
    facts.carrier = "Mutate";
  } catch {
    threw = true;
  }
  assert(threw || facts.carrier === "Acme", "facts resist mutation");

  const findings = evaluateInsuranceBusinessRules(facts);
  assert(
    findings.some((item) => item.ruleId === "PI-003"),
    "PI-003 Increasing Death Benefit"
  );
  assert(
    findings.some((item) => item.ruleId === "PI-005"),
    "PI-005 High Illustration Dependency"
  );
  assert(
    findings.every((item) => item.ruleId && item.evidence && item.explanation),
    "every finding has ruleId, evidence, explanation"
  );

  const analysis = analyzeInsuranceLanguage(extracted, { extractionId: "ex-1" });
  assert(analysis.recommendations.length > 0, "recommendations from findings");
  assert(
    analysis.recommendations.every((item) => item.source === "findings"),
    "recommendations sourced from findings"
  );
  assert(analysis.execution.rulesExecutedCount === 15, "all PI rules executed");
  assert(analysis.execution.rulesTriggeredCount > 0, "some rules triggered");
  assert(typeof analysis.execution.executionTimeMs === "number", "execution time recorded");

  const ai = buildAiLanguageContext(analysis, { reviewId: "rev-1" });
  assert(ai.mayModifyFacts === false, "AI cannot modify facts");
  assert(ai.mayCreateFacts === false, "AI cannot create facts");
  assert(ai.recommendationsIncluded === false, "AI omits recommendations");
  assert(Array.isArray(ai.findings), "AI receives findings");
  assert(ai.insuranceFacts.carrier === "Acme", "AI receives facts");

  console.log("languageLayer.test.js (BR-057 / BR-058 / BR-059) passed");
}

run();
