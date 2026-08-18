/**
 * BR-144 — Policy Cost + Living Benefit Economics.
 */

const fs = require("fs");
const path = require("path");
const { extractIllustrationFromPages, ADAPTER_KEYS } = require("../illustration-extract");
const { nationwideIllustratedPages } = require("../illustration-extract/fixtures/nationwideIulLedgerFixture");
const {
  nationwideExplicitMonthlyCoiPages,
  nationwideAvMinusCsvIsNotCoiPages
} = require("../illustration-extract/fixtures/nationwideExplicitCoiFixture");
const { lswFlexLifeIi20417FLPages } = require("../illustration-extract/fixtures/lswFlexLifeIi20417FLFixture");
const { parseNationwidePolicyCosts } = require("../illustration-extract/parseNationwidePolicyCosts");
const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");
const { buildInsuranceFactsFromExtract } = require("../insurance-language/InsuranceFacts");
const { normalizePolicyExtractionData } = require("../PolicyExtractionModel");
const {
  VALUE_CLASSIFICATIONS,
  CARRIER_CALCULATION_REQUIRED_TEXT,
  sumKnownDollarValues,
  unavailableValue,
  extractedExact,
  resolveAcceleratedBenefitPayout,
  createRiderEconomics,
  buildPolicyEconomicsReportDto
} = require("./index");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const allNull = sumKnownDollarValues([
    unavailableValue("missing"),
    unavailableValue("missing")
  ]);
  assert(allNull.value === null, "null costs never become zero");
  assert(allNull.classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE, "all-null sum is NOT_AVAILABLE");

  const mixed = sumKnownDollarValues([
    unavailableValue("missing"),
    extractedExact(0),
    extractedExact(25)
  ]);
  assert(mixed.value === 25, "explicit zeros may participate; unavailable ignored");
  assert(extractedExact(0).value === 0, "explicit source zero remains zero");
  assert(extractedExact(0).classification === VALUE_CLASSIFICATIONS.EXTRACTED_EXACT, "explicit zero classified");

  const payout = resolveAcceleratedBenefitPayout({
    discountFactor: null,
    deathBenefitElectedForAcceleration: 50000
  });
  assert(payout.classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED, "incomplete chain fail-closed");
  assert(payout.actualCashBenefit === null, "does not assume cash = accelerated DB");
  assert(payout.reportText === CARRIER_CALCULATION_REQUIRED_TEXT, "canonical report text");

  const nationwide = extractIllustrationFromPages(nationwideIllustratedPages());
  const lsw = extractIllustrationFromPages(lswFlexLifeIi20417FLPages());
  assert(nationwide.adapterKey === ADAPTER_KEYS.NATIONWIDE_IUL, "Nationwide adapter");
  assert(lsw.adapterKey === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL, "LSW adapter");
  assert(
    nationwide.riders.every((rider) => rider.adapterKey === "nationwide-iul"),
    "Nationwide riders isolated"
  );
  assert(
    lsw.riders.filter((rider) => /ABR/i.test(rider.type)).every(
      (rider) => rider.discountMethodology === "national_life_abr_mortality_table_and_interest_discount"
    ),
    "National Life discount methodology preserved"
  );
  assert(
    nationwide.riders.some(
      (rider) => rider.discountMethodology === "more_than_dollar_for_dollar_at_claim"
    ),
    "Nationwide discount methodology stays Nationwide"
  );
  assert(
    !lsw.riders.some((rider) => rider.discountMethodology === "more_than_dollar_for_dollar_at_claim"),
    "LSW does not reuse Nationwide discount language"
  );
  assert(
    !nationwide.riders.some((rider) => /8052FL|8095FL/.test(rider.formNumber || "")),
    "Nationwide does not capture LSW ABR forms"
  );

  const nationwideSrc = fs.readFileSync(
    path.join(__dirname, "../illustration-extract/parseNationwideLivingBenefitRiders.js"),
    "utf8"
  );
  const lswSrc = fs.readFileSync(
    path.join(__dirname, "../illustration-extract/parseLswFlexLifeRiders.js"),
    "utf8"
  );
  assert(!nationwideSrc.includes("8052FL"), "Nationwide rider parser does not reference LSW forms");
  assert(!lswSrc.includes("ICC13-NWLA"), "LSW rider parser does not reference Nationwide ICC forms");

  const coiPages = nationwideExplicitMonthlyCoiPages();
  const coiTerms = parseNationwidePolicyCosts(coiPages);
  assert(coiTerms.costOfInsurance.annualByYear[1].value === 144, "monthly $12 * 12 = 144");
  assert(
    coiTerms.costOfInsurance.annualByYear[1].classification ===
      VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
    "monthly COI annualizes from explicit terms"
  );

  const trap = nationwideAvMinusCsvIsNotCoiPages();
  const trapTerms = parseNationwidePolicyCosts(trap);
  const av = 5000;
  const csv = 1000;
  assert(trapTerms.costOfInsurance.annualDollars.value == null, "AV−CSV is not stored as COI");
  assert(trapTerms.costOfInsurance.annualDollars.value !== av - csv, "does not infer 4000 COI");

  const lswAnalysis = analyzeAnnualValues(lsw.engineRows);
  assert(lswAnalysis.summaryMetrics.totalCostOfInsurance === null, "LSW total COI is not $0");
  assert(lswAnalysis.summaryMetrics.totalRiderCharges === null, "LSW total rider charges is not $0");
  assert(
    lsw.policyCostTerms.costOfInsurance.annualDollars.classification ===
      VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
    "LSW COI terms remain NOT_AVAILABLE"
  );

  const terminal = lsw.riders.find((rider) => rider.formNumber === "8052FL");
  assert(terminal.payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED, "LSW ABR fail-closed");
  assert(terminal.payoutReportText === CARRIER_CALCULATION_REQUIRED_TEXT, "LSW report text");
  assert(terminal.discountSampleInterestRate === 0.065, "6.5% remains illustrative");
  assert(/illustrative_only/.test(terminal.discountSampleNote || ""), "sample labeled illustrative");

  const normalized = normalizePolicyExtractionData({
    carrier: "Nationwide",
    riders: nationwide.riders,
    policyCostTerms: nationwide.policyCostTerms
  });
  const chronic = normalized.riders.find((rider) => rider.formNumber === "ICC20-NWLA-567");
  assert(chronic.discountMethodology === "more_than_dollar_for_dollar_at_claim", "extraction keeps economics");
  assert(chronic.eligibilityDefinition, "eligibility survives normalize");
  const facts = buildInsuranceFactsFromExtract(normalized);
  const factChronic = facts.riders.find((rider) => rider.formNumber === "ICC20-NWLA-567");
  assert(factChronic.formNumber === "ICC20-NWLA-567", "InsuranceFacts keeps form number");
  assert(factChronic.discountMethodology === "more_than_dollar_for_dollar_at_claim", "Facts keep discount methodology");
  assert(factChronic.payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED, "Facts keep fail-closed payout");
  assert(facts.policyCostTerms.costOfInsurance.annualDollars.value == null, "Facts keep unavailable COI");

  const dto = buildPolicyEconomicsReportDto({
    timeline: lswAnalysis.timeline,
    costTerms: lsw.policyCostTerms,
    riders: lsw.riders,
    adapterKey: lsw.adapterKey
  });
  const year1 = dto.policyCostCheckpoints.find((row) => row.requestedYear === 1);
  assert(year1.year === 1 && year1.fallback === false, "LSW checkpoint year 1 exact");
  assert(year1.costOfInsurance.value == null, "LSW DTO COI null");
  assert(year1.otherKnownCharges.value == null, "LSW other known charges stay unknown");
  assert(year1.totalKnownPolicyCosts.value == null, "LSW known costs stay unknown");
  assert(dto.policyCostCategories.length === 7, "seven cost category cards");
  assert(
    dto.policyCostCategories.every((card) => card.display.value !== 0 || card.display.classification === "EXTRACTED_EXACT"),
    "category cards do not coerce unknown to zero"
  );
  const abrCard = dto.livingBenefitCards.find((card) => card.form === "8052FL");
  assert(abrCard.carrierCalculationRequired === true, "LSW ABR card fail-closed");

  const generic = createRiderEconomics({
    type: "Chronic Illness",
    discountFactor: 0.8,
    deathBenefitElectedForAcceleration: 100000,
    actualCashBenefit: 80000,
    completeCalculationChain: false
  });
  assert(generic.actualCashBenefit == null, "does not accept cash=accelerated without complete chain");
  assert(generic.discountFactor === 0.8, "explicit factor may be stored");
  assert(generic.payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED, "still fail-closed without full chain");

  console.log("policyEconomics.test.js (BR-144) passed");
}

run();
