/**
 * Illustration extract tests — Nationwide-style ledger + validation + riders.
 */

const { parseIulIllustrationTables, toAnnualValuesEngineRows } = require("./parseIulIllustrationTables");
const { parseNationwideLivingBenefitRiders } = require("./parseNationwideLivingBenefitRiders");
const { parseNationwidePolicyCosts } = require("./parseNationwidePolicyCosts");
const { extractIllustrationFromPages } = require("./index");
const { buildReportCheckpoints } = require("./reportCheckpoints");
const { nationwideIllustratedPages } = require("./fixtures/nationwideIulLedgerFixture");
const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");
const { validateAnnualValuesTimeline } = require("../annual-values/validateAnnualValuesTimeline");
const {
  buildPolicyEconomicsReportDto,
  VALUE_CLASSIFICATIONS,
  CARRIER_CALCULATION_REQUIRED_TEXT
} = require("../policy-economics");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const pages = nationwideIllustratedPages();
  const parsed = parseIulIllustrationTables(pages);

  assert(parsed.rows.length === 20, `illustrated timeline should be 20 sequential years, got ${parsed.rows.length}`);
  assert(parsed.rows[0].policyYear === 1, "starts at year 1");
  assert(parsed.rows[0].insuredAge === 55, "attained age 55 in year 1");
  assert(parsed.rows[0].annualPremium === 2076, "annual premium outlay from monthly 173");
  assert(parsed.rows[0].accountValue === 1422, "illustrated accumulated value, not guaranteed 297");
  assert(parsed.rows[0].cashSurrenderValue === 0, "year 1 CSV is 0");
  assert(parsed.rows[0].cashValue === null, "does not invent cashValue from accumulated value");
  assert(parsed.rows[0].deathBenefit === 100000, "death benefit");
  assert(parsed.rows[4].accountValue === 8202, "year 5 illustrated AV");
  assert(parsed.rows[4].cashSurrenderValue === 5745, "year 5 illustrated CSV stays separate from AV");
  assert(parsed.rows[0].sourcePage === 22, "source page provenance");
  assert(parsed.rows[4].surrenderCharge === 2456.76, "surrender charge schedule attached by year");
  assert(parsed.interpolated === false, "no interpolation");

  const engineRows = toAnnualValuesEngineRows(parsed.rows);
  const analysis = analyzeAnnualValues(engineRows, { source: "pdf_text_table" });
  assert(analysis.timeline.length === 20, "engine normalizes 20 years");
  assert(analysis.timeline[0].costOfInsurance === null, "missing COI stays null");
  assert(analysis.timeline[0].accountValue === 1422, "AV mapped");
  assert(analysis.timeline[0].cashSurrenderValue === 0, "CSV mapped");
  assert(analysis.timeline[0].cashValue === null, "cashValue not copied from AV");
  assert(analysis.validationResults.valid === true, "sequential illustrated years validate");
  assert(analysis.meta.ocr === false, "engine ocr flag false");

  const checkpoints = buildReportCheckpoints(analysis.timeline);
  const year1 = checkpoints.find((point) => point.requestedYear === 1);
  const year10 = checkpoints.find((point) => point.requestedYear === 10);
  const year30 = checkpoints.find((point) => point.requestedYear === 30);
  assert(year1.usedYear === 1 && year1.fallback === false, "year 1 checkpoint exact");
  assert(year10.usedYear === 10 && year10.fallback === false, "year 10 checkpoint exact");
  assert(year30.fallback === true && year30.usedYear === 20, "year 30 falls back 5-year steps to 20");

  const riders = parseNationwideLivingBenefitRiders(pages);
  const types = riders.map((rider) => rider.type);
  assert(types.includes("Terminal Illness"), "terminal illness rider captured");
  assert(types.includes("Chronic Illness"), "chronic illness rider captured");
  assert(types.includes("Critical Illness"), "critical illness rider captured");
  assert(types.includes("Overloan Lapse Protection"), "overloan captured as modeled rider");
  const terminal = riders.find((rider) => rider.type === "Terminal Illness");
  assert(terminal.formNumber === "ICC13-NWLA-495", "terminal form number");
  assert(terminal.maximumAccelerationPercent === 50, "explicit 50% acceleration");
  assert(terminal.minimumDollarAmount === 10000, "min is payment $10,000 not policy-minimum $50,000");
  assert(terminal.maximumDollarAmount === 250000, "explicit max dollar");
  assert(terminal.estimatedActualCashBenefit === null, "does not calculate cash benefit");
  assert(terminal.payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED, "terminal payout fail-closed");
  assert(terminal.discountFactor === null, "no generic discount factor");
  const chronic = riders.find((rider) => rider.type === "Chronic Illness");
  assert(chronic.formNumber === "ICC20-NWLA-567", "chronic form from later page");
  assert(chronic.sourcePage === 15, "chronic heading starts page 15");
  assert(chronic.discountMethodology === "more_than_dollar_for_dollar_at_claim", "claim discount methodology from page 16");
  assert(chronic.riderCharges.administrativeChargeCap === 250, "admin cap from multi-page window");
  assert(chronic.discountFactor === null, "chronic has no numeric factor");
  const critical = riders.find((rider) => rider.type === "Critical Illness");
  assert(critical.formNumber === "ICC20-NWLA-606", "critical form number");
  assert(critical.annualLimitPercent === 10, "10% is per-event annual limit");
  assert(critical.maximumAccelerationPercent == null, "10% is not stored as max acceleration");
  assert(critical.annualLimitDollars === 25000, "per-event dollar cap");
  assert(critical.maxClaims === 5, "5-claim cap from following page");
  assert(critical.payoutClassification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED, "critical payout fail-closed");

  const costs = parseNationwidePolicyCosts(pages);
  assert(costs.percentOfPremiumExpenseCharge.existenceMentioned === true, "percent of premium mentioned");
  assert(costs.percentOfPremiumExpenseCharge.rate.value == null, "does not invent premium-load rate");
  assert(
    costs.percentOfPremiumExpenseCharge.rate.classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE,
    "percent of premium is NOT_AVAILABLE"
  );
  assert(costs.costOfInsurance.annualDollars.value == null, "COI stays unavailable");
  assert(costs.costOfInsurance.continuationOfCoiEndorsement.storedAsAnnualCoi === false, "25% CRCOI is not annual COI");
  assert(costs.surrenderCharges.schedule.length >= 3, "surrender schedule extracted");
  assert(costs.surrenderCharges.separateFromCsv === true, "surrender stays separate from CSV");

  const extracted = extractIllustrationFromPages(pages);
  const timeline = analysis.timeline.map((row) => {
    const source = parsed.rows.find((item) => item.policyYear === row.policyYear) || {};
    return {
      ...row,
      surrenderCharge: source.surrenderCharge ?? null,
      sourcePage: source.sourcePage ?? row.sourcePage
    };
  });
  const dto = buildPolicyEconomicsReportDto({
    timeline,
    costTerms: extracted.policyCostTerms,
    riders: extracted.riders,
    adapterKey: extracted.adapterKey,
    carrier: "Nationwide",
    product: "IUL Protector II"
  });
  const dtoYear1 = dto.policyCostCheckpoints.find((row) => row.requestedYear === 1);
  assert(dtoYear1.fallback === false && dtoYear1.year === 1, "DTO year 1 exact");
  assert(dtoYear1.costOfInsurance.value == null, "DTO COI null not $0");
  assert(dtoYear1.costOfInsurance.classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE, "DTO COI NOT_AVAILABLE");
  assert(dtoYear1.totalKnownPolicyCosts.value == null, "unknown costs do not total to $0");
  assert(dtoYear1.surrenderCharge.value === 2680, "DTO surrender year 1");
  assert(dtoYear1.cashSurrenderValue.value === 0, "year 1 CSV explicit zero kept");
  assert(dtoYear1.surrenderChargeSeparateFromCsv === true, "DTO keeps SC off CSV");
  const terminalCard = dto.livingBenefitCards.find((card) => card.form === "ICC13-NWLA-495");
  assert(terminalCard.carrierCalculationRequired === true, "card requires carrier calculation");
  assert(terminalCard.carrierCalculationRequiredText === CARRIER_CALCULATION_REQUIRED_TEXT, "canonical report text");
  assert(terminalCard.discountFactor == null, "card has no invented factor");
  assert(terminalCard.exactPayout.value == null, "card exact payout null");

  const duplicate = validateAnnualValuesTimeline([
    { policyYear: 1, insuredAge: 55, annualPremium: 100, accountValue: 1, cashSurrenderValue: 0, deathBenefit: 1000 },
    { policyYear: 1, insuredAge: 56, annualPremium: 100, accountValue: 2, cashSurrenderValue: 0, deathBenefit: 1000 }
  ]);
  assert(duplicate.errors.some((error) => error.code === "DUPLICATE_POLICY_YEAR"), "duplicate years fail");

  const impossibleAge = validateAnnualValuesTimeline([
    { policyYear: 1, insuredAge: 200, annualPremium: 100, deathBenefit: 1000 }
  ]);
  assert(impossibleAge.errors.some((error) => error.code === "IMPOSSIBLE_INSURED_AGE"), "impossible age fails");

  const negative = validateAnnualValuesTimeline([
    { policyYear: 1, insuredAge: 55, annualPremium: -10, deathBenefit: 1000 }
  ]);
  assert(negative.errors.some((error) => error.code === "NEGATIVE_VALUE"), "negative premium fails");

  const missingIdentity = validateAnnualValuesTimeline([
    { policyYear: null, insuredAge: 55, annualPremium: 10, deathBenefit: 1000 }
  ]);
  assert(missingIdentity.errors.some((error) => error.code === "MISSING_POLICY_YEAR"), "missing year fails");

  console.log("illustrationExtract.test.js passed");
}

run();
