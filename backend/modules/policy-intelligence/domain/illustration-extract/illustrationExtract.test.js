/**
 * Illustration extract tests — Nationwide-style ledger + validation + riders.
 */

const { parseIulIllustrationTables, toAnnualValuesEngineRows } = require("./parseIulIllustrationTables");
const { parseLivingBenefitRiders } = require("./parseLivingBenefitRiders");
const { buildReportCheckpoints } = require("./reportCheckpoints");
const { nationwideIllustratedPages } = require("./fixtures/nationwideIulLedgerFixture");
const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");
const { validateAnnualValuesTimeline } = require("../annual-values/validateAnnualValuesTimeline");

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

  const riders = parseLivingBenefitRiders(pages);
  const types = riders.map((rider) => rider.type);
  assert(types.includes("Terminal Illness"), "terminal illness rider captured");
  assert(types.includes("Chronic Illness"), "chronic illness rider captured");
  assert(types.includes("Critical Illness"), "critical illness rider captured");
  const terminal = riders.find((rider) => rider.type === "Terminal Illness");
  assert(terminal.maximumAccelerationPercent === 50, "explicit 50% acceleration");
  assert(terminal.maximumDollarAmount === 250000, "explicit max dollar");
  assert(terminal.estimatedActualCashBenefit === null, "does not calculate cash benefit");
  const chronic = riders.find((rider) => rider.type === "Chronic Illness");
  assert(chronic.discountMethodology === "more_than_dollar_for_dollar_at_claim", "claim discount methodology");
  assert(chronic.riderCharges.administrativeChargeCap === 250, "admin cap explicit");

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
