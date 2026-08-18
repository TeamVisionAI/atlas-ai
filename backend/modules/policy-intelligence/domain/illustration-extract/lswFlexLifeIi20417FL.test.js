/**
 * LSW FlexLife II (20417FL) adapter tests.
 * Nationwide ledger parser is exercised only as a negative control.
 */

const fs = require("fs");
const path = require("path");
const {
  extractIllustrationFromPages,
  ADAPTER_KEYS
} = require("./index");
const { parseLedgerRow } = require("./parseIulIllustrationTables");
const { SCENARIOS } = require("./adapters/lswFlexLifeIi20417FL");
const { lswFlexLifeIi20417FLPages } = require("./fixtures/lswFlexLifeIi20417FLFixture");
const { nationwideIllustratedPages } = require("./fixtures/nationwideIulLedgerFixture");
const { analyzeAnnualValues } = require("../annual-values/annualValuesEngine");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nearlyEqual(a, b, epsilon = 0.0001) {
  return Math.abs(a - b) <= epsilon;
}

function run() {
  const pages = lswFlexLifeIi20417FLPages();
  const extracted = extractIllustrationFromPages(pages);

  assert(extracted.adapterKey === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL, "routes to LSW adapter");
  assert(extracted.baseForm === "20417FL", "base form");
  assert(extracted.comparisonScenario === SCENARIOS.CURRENT_ILLUSTRATED, "comparison uses current illustrated");

  const year1 = extracted.rows.find((row) => row.policyYear === 1);
  assert(year1, "year 1 present on comparison timeline");
  assert(year1.annualPremium === 2991.53, `year 1 premium ${year1.annualPremium}`);
  assert(year1.accountValue === 1921, `year 1 AV ${year1.accountValue}`);
  assert(year1.cashSurrenderValue === 0, "year 1 CSV is 0");
  assert(year1.deathBenefit === 294921, `year 1 DB ${year1.deathBenefit}`);
  assert(year1.accountValue !== 5.52, "5.52 is not accumulated value");
  assert(nearlyEqual(year1.illustratedRate, 0.0552), `illustrated rate stored as fraction, got ${year1.illustratedRate}`);
  assert(year1.costOfInsurance === null, "COI stays null");
  assert(year1.premiumLoad === null, "premium load stays null");
  assert(year1.administrativeCharge === null, "admin charge stays null");
  assert(year1.riderCharges === null, "rider charges stay null");

  const scenarios = extracted.scenarios;
  const guaranteedY1 = scenarios[SCENARIOS.GUARANTEED].find((row) => row.policyYear === 1);
  const altY1 = scenarios[SCENARIOS.ALTERNATIVE_CURRENT].find((row) => row.policyYear === 1);
  const distY1 = scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS].find(
    (row) => row.policyYear === 1
  );
  assert(guaranteedY1.accountValue === 1631, "guaranteed year 1 AV");
  assert(altY1.accountValue === 1896, "alternative current year 1 AV");
  assert(nearlyEqual(altY1.illustratedRate, 0.03), "alternative current 3.00%");
  assert(distY1.accountValue === 1921, "distributions year 1 AV matches current illustrated");
  assert(distY1.plannedLoan === 0 && distY1.accumulatedLoan === 0, "distributions loans present as zeros");
  const distY32 = scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS].find((row) => row.policyYear === 32);
  const distY40 = scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS].find((row) => row.policyYear === 40);
  const distY60 = scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS].find((row) => row.policyYear === 60);
  const distY86 = scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS].find((row) => row.policyYear === 86);
  assert(distY32 && distY32.plannedLoan === 17265 && distY32.accumulatedLoan === 18280, "year 32 distribution loans");
  assert(distY32.sourcePage === 26, "year 32 distribution page");
  assert(distY40 && distY40.plannedLoan === 27270 && distY40.accumulatedLoan === 209023, "year 40 distribution loans");
  assert(distY60 && distY60.plannedLoan === 85498 && distY60.accumulatedLoan === 1319188, "year 60 distribution loans");
  assert(distY86 && distY86.plannedLoan === 377676 && distY86.accumulatedLoan === 6889734, "year 86 distribution loans");
  assert(distY86.sourcePage === 28, "year 86 distribution page");
  assert(year1.plannedLoan === 0 && year1.accumulatedLoan === 0, "current illustrated dual-ledger still has placeholder zeros");
  assert(year1.sourcePage === 21, "canonical current illustrated stays on pages 21–24");
  assert(
    guaranteedY1.accountValue !== year1.accountValue && altY1.accountValue !== year1.accountValue,
    "four scenarios stay separated"
  );

  const year36 = extracted.rows.find((row) => row.policyYear === 36);
  assert(year36 && year36.accountValue === 270705, "year 36 keeps Current Illustrated after Alternative Current lapses");
  assert(year36.accountValue !== 6.83, "lapse-row rate is not AV");
  const altY36 = scenarios[SCENARIOS.ALTERNATIVE_CURRENT].find((row) => row.policyYear === 36);
  assert(altY36 && altY36.lapse === true && altY36.accountValue == null, "alternative current lapses year 36");

  assert(
    extracted.rows.every((row) => row.costOfInsurance == null),
    "every comparison row keeps COI null"
  );
  assert(extracted.surrenderCharges.length === 0, "does not manufacture a surrender dollar table");
  assert(extracted.surrenderMechanics.years === 10, "10-year declining surrender term preserved");
  assert(extracted.surrenderMechanics.dollarTableAvailable === false, "no invented SC dollars");

  const analysis = analyzeAnnualValues(extracted.engineRows);
  assert(analysis.timeline[0].costOfInsurance === null, "engine COI null");
  assert(analysis.timeline[0].accountValue === 1921, "engine AV");
  assert(analysis.timeline[0].cashSurrenderValue === 0, "engine CSV");

  const forms = extracted.riders.map((rider) => rider.formNumber);
  for (const form of ["8052FL", "8095FL", "20287FL", "20288FL"]) {
    assert(forms.includes(form), `ABR form ${form} captured`);
  }
  for (const form of ["20186FL", "20223FL", "20256FL", "20266FL", "8315", "20431", "20430FL"]) {
    assert(forms.includes(form), `rider form ${form} captured`);
  }
  const terminal = extracted.riders.find((rider) => rider.formNumber === "8052FL");
  assert(terminal.discountFactor === null, "does not store a reusable discount factor");
  assert(terminal.estimatedActualCashBenefit === null, "does not treat sample ABR as cash received");
  assert(terminal.payoutClassification === "CARRIER_CALCULATION_REQUIRED", "exact payout fail-closed");
  assert(terminal.cashReceivedNotEqualToAmountAccelerated === true, "cash ≠ amount accelerated");
  assert(
    terminal.discountMethodology === "national_life_abr_mortality_table_and_interest_discount",
    "National Life discount methodology"
  );
  assert(terminal.discountSampleInterestRate === 0.065, "6.5% sample is labeled illustrative");
  assert(terminal.maximumAccelerationPercent === 100, "up to 100% acceleration");
  const chronic = extracted.riders.find((rider) => rider.formNumber === "8095FL");
  assert(chronic.monthlyLimit === 30000, "chronic monthly dollar cap");
  assert(chronic.annualLimitPercent === 24, "chronic annual percent cap");

  const adapterSrc = fs.readFileSync(
    path.join(__dirname, "adapters/lswFlexLifeIi20417FL.js"),
    "utf8"
  );
  assert(!adapterSrc.includes("parseIulIllustrationTables"), "LSW adapter does not import Nationwide parser");
  assert(!adapterSrc.includes("nonguaranteedCurrent"), "LSW adapter does not use Nationwide dual current block");
  assert(!/values\.length >= 7/.test(adapterSrc), "LSW adapter does not use Nationwide 7-value column map");

  const nationwideTokens = "1 35 $2,991.53 $0 $0 $0 5.52 % $1,921 $0 $294,921"
    .replace(/,/g, "")
    .match(/\bLapse\b|-?\d+(?:\.\d+)?/gi);
  const nationwideY1 = parseLedgerRow(nationwideTokens, {
    page: 25,
    scenario: "unspecified",
    tableLabel: "annual_ledger"
  });
  assert(nationwideY1 && nationwideY1.accountValue === 5.52, "Nationwide map would treat 5.52 as AV");
  assert(year1.accountValue === 1921, "LSW adapter does not use that Nationwide map");

  const nationwideExtract = extractIllustrationFromPages(nationwideIllustratedPages());
  assert(nationwideExtract.adapterKey === ADAPTER_KEYS.NATIONWIDE_IUL, "Nationwide fixture still routes to Nationwide");
  assert(nationwideExtract.rows.length === 20, "Nationwide regression length");
  assert(nationwideExtract.rows[0].accountValue === 1422, "Nationwide illustrated AV unchanged");
  assert(nationwideExtract.rows[0].cashSurrenderValue === 0, "Nationwide CSV unchanged");
  assert(nationwideExtract.rows[4].accountValue === 8202, "Nationwide year 5 AV unchanged");

  console.log("lswFlexLifeIi20417FL.test.js passed");
}

run();
