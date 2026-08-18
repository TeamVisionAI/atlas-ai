/**
 * Client-facing Policy Intelligence report assembler (BR-144).
 * No PDF persist. No new financial math.
 */

const fs = require("fs");
const path = require("path");
const { assembleClientPolicyReport } = require("../modules/policy-intelligence/application/assembleClientPolicyReport");
const { serializeIllustrationScenarios } = require("../modules/policy-intelligence/application/AnnualValuesService");
const {
  extractIllustrationFromPages,
  ADAPTER_KEYS
} = require("../modules/policy-intelligence/domain/illustration-extract");
const { nationwideIllustratedPages } = require("../modules/policy-intelligence/domain/illustration-extract/fixtures/nationwideIulLedgerFixture");
const { lswFlexLifeIi20417FLPages } = require("../modules/policy-intelligence/domain/illustration-extract/fixtures/lswFlexLifeIi20417FLFixture");
const { VALUE_CLASSIFICATIONS } = require("../modules/policy-intelligence/domain/policy-economics");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function asSet(extracted) {
  return {
    timeline: (extracted.rows || []).map((row) => ({
      ...row,
      metadata: {
        surrenderCharge: row.surrenderCharge ?? null,
        sourcePage: row.sourcePage ?? null
      }
    })),
    metadata: {
      adapterKey: extracted.adapterKey,
      comparisonScenario: extracted.comparisonScenario || extracted.scenario || null,
      illustrationScenario: extracted.scenario || extracted.comparisonScenario || null,
      policyCostTerms: extracted.policyCostTerms,
      riders: extracted.riders,
      baseForm: extracted.baseForm || null,
      issuer: extracted.issuer || null,
      product: extracted.product || null
    },
    calculationMetadata: {
      fieldClassifications: {
        totalCostOfInsurance: "NOT_AVAILABLE"
      }
    }
  };
}

function asSetWithScenarios(extracted) {
  const set = asSet(extracted);
  const scenarios = serializeIllustrationScenarios(extracted.scenarios);
  if (scenarios) {
    set.metadata.scenarios = scenarios;
  }
  return set;
}

function checkpointByYear(checkpoints, year) {
  return (checkpoints || []).find((row) => Number(row.policyYear) === year || Number(row.usedYear) === year);
}

function run() {
  const nationwide = extractIllustrationFromPages(nationwideIllustratedPages());
  const lsw = extractIllustrationFromPages(lswFlexLifeIi20417FLPages());

  const nwReport = assembleClientPolicyReport({
    review: { id: "nw-review", title: "Nationwide Test-1" },
    extractedData: {
      carrier: "Nationwide",
      product: "IUL Protector II",
      productType: "Indexed Universal Life",
      insured: { issueAge: 35, gender: "Male", tobaccoStatus: "Non-Smoker" },
      premium: { amount: 2076, frequency: "annual" },
      faceAmount: 100000,
      deathBenefitOption: "Level",
      riders: nationwide.riders,
      policyCostTerms: nationwide.policyCostTerms
    },
    annualValues: asSet(nationwide)
  });

  assert(nwReport.adapter.key === ADAPTER_KEYS.NATIONWIDE_IUL, "Nationwide adapter");
  assert(nwReport.adapter.supported === true, "Nationwide supported");
  assert(nwReport.annualValuesAvailable === true, "Nationwide timeline present");
  assert(nwReport.snapshot.carrier === "Nationwide", "snapshot carrier");
  assert(nwReport.economics.policyCostCategories.length === 7, "7 cost cards");
  const nwCoi = nwReport.economics.policyCostCategories.find((c) => c.id === "cost_of_insurance");
  assert(nwCoi.display.value == null, "Nationwide COI is not a dollar");
  assert(nwCoi.display.classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE, "COI NOT_AVAILABLE");
  assert(nwCoi.display.value !== 0, "COI is not $0");
  const nwSurrender = nwReport.economics.policyCostCategories.find((c) => c.id === "surrender_charges");
  assert(nwSurrender.scheduleLength >= 3, "surrender schedule available");
  const nwYear1 = nwReport.economics.policyCostCheckpoints.find((row) => row.requestedYear === 1);
  assert(nwYear1.surrenderCharge.value != null, "year 1 surrender sourced");
  assert(nwYear1.accountValue.value != null, "AV present");
  assert(nwYear1.cashSurrenderValue.value != null, "CSV present");
  assert(nwYear1.surrenderChargeSeparateFromCsv === true, "SC separate from CSV");
  const terminal = nwReport.economics.livingBenefitCards.find((card) => card.form === "ICC13-NWLA-495");
  assert(terminal, "Nationwide terminal rider card");
  assert(terminal.limits.minAccelerationDollars === 10000, "terminal min 10000");
  assert(terminal.carrierCalculationRequired === true, "terminal carrier calc");
  const critical = nwReport.economics.livingBenefitCards.find((card) => card.form === "ICC20-NWLA-606");
  assert(critical.limits.annualLimitPercent === 10, "critical 10% is a limit");
  assert(critical.cashReceivedNotEqualToAmountAccelerated === true, "cash ≠ accelerated DB");
  assert(Array.isArray(nwReport.illustrationSource.pages), "Nationwide illustration pages array");
  assert(
    nwReport.illustrationSource.pages.every((page) => Number.isInteger(page) && page > 0),
    "Nationwide pages are stored integers"
  );
  assert(!nwReport.illustrationSource.pages.includes(0), "does not invent page 0");
  const terminalPages = terminal.sourcePages || [];
  assert(
    terminalPages.length === 0 || terminalPages.every((page) => Number.isInteger(page) && page > 0),
    "rider pages are stored only"
  );

  assert(nwReport.distributionScenario == null, "Nationwide stays on the standard report path");
  assert(nwReport.chargeScheduleUndisclosed === true, "Nationwide COI classification is NOT_AVAILABLE");

  const assemblerSrc = fs.readFileSync(
    path.join(__dirname, "../modules/policy-intelligence/application/assembleClientPolicyReport.js"),
    "utf8"
  );
  assert(!assemblerSrc.includes("loan_balance"), "does not fall back to canonical loan_balance");
  assert(!assemblerSrc.includes("accountValue -"), "does not derive debt from AV - CSV");

  const nlReport = assembleClientPolicyReport({
    review: { id: "nl-review", title: "National Life FlexLife II" },
    extractedData: {
      carrier: "National Life Group",
      product: "FlexLife II",
      insured: { issueAge: 34 },
      premium: { amount: 2991.53, frequency: "annual" },
      riders: lsw.riders,
      policyCostTerms: lsw.policyCostTerms,
      mechanics: { issuer: "Life Insurance Company of the Southwest", baseForm: "20417FL" }
    },
    annualValues: asSetWithScenarios(lsw)
  });

  assert(nlReport.adapter.key === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL, "LSW adapter");
  assert(nlReport.snapshot.formVersion === "20417FL", "LSW form");
  const abr = nlReport.economics.livingBenefitCards.find((card) => card.form === "8052FL");
  assert(abr.carrierCalculationRequired === true, "LSW ABR carrier calc");
  assert(
    abr.discountMethodology === "national_life_abr_mortality_table_and_interest_discount",
    "National Life methodology"
  );
  assert(
    !nlReport.economics.livingBenefitCards.some((card) => String(card.form || "").includes("NWLA")),
    "no Nationwide forms on LSW report"
  );
  const nlCoi = nlReport.economics.policyCostCategories.find((c) => c.id === "cost_of_insurance");
  assert(nlCoi.display.value == null, "LSW COI not $0");
  const lastExact = nlReport.economics.policyCostCheckpoints.find(
    (row) => row.requestedYear === 36 && row.fallback === false
  );
  assert(lastExact && lastExact.usedYear === 36, "later exact LSW year included");
  assert(nlReport.illustrationSource.label === "Current Illustrated Annual Values", "LSW current illustrated label");
  assert(nlReport.illustrationSource.pages.includes(21), "LSW annual values include stored page 21");
  assert(!nlReport.illustrationSource.pages.includes(24), "does not invent page 24");
  const chronic = nlReport.economics.livingBenefitCards.find((card) => card.form === "8095FL");
  assert(chronic, "chronic ABR card");
  assert(chronic.provenance.sourcePage === 9, "8095FL stored first matching page");
  assert(!chronic.sourcePages.includes(10), "does not invent 8095FL page 10");
  assert(
    chronic.sourcePages.every((page) => Number.isInteger(page) && page > 0),
    "chronic pages are stored integers"
  );

  const dist = nlReport.distributionScenario;
  assert(dist, "National Life exposes persisted distribution scenario");
  assert(dist.scenario === "current_illustrated_distributions", "scenario key is metadata only");
  assert(dist.sourceLabel === "Distributions Ledger", "Distributions Ledger label");
  assert(dist.distributionStartYear === 32, "start year from first nonzero income/plannedLoan");
  assert(dist.sourcePages.includes(25), "includes ledger page 25");
  assert(dist.sourcePages.includes(26), "includes ledger page 26");
  assert(dist.sourcePages.includes(27), "includes ledger page 27");
  assert(dist.sourcePages.includes(28), "includes ledger page 28");
  assert(!dist.sourcePages.includes(21), "does not relabel Current Illustrated pages as distributions");
  assert(nlReport.chargeScheduleUndisclosed === true, "LSW COI remains NOT_AVAILABLE");

  const y32 = checkpointByYear(dist.checkpoints, 32);
  const y40 = checkpointByYear(dist.checkpoints, 40);
  const y60 = checkpointByYear(dist.checkpoints, 60);
  const y86 = checkpointByYear(dist.checkpoints, 86);
  assert(y32 && y32.sourcePage === 26, "year 32 source page 26");
  assert(y32.income.value === 17265 && y32.plannedLoan.value === 17265, "year 32 income/loan");
  assert(y32.accumulatedLoan.value === 18280, "year 32 accumulated loan");
  assert(y32.accountValue.value === 213397, "year 32 AV");
  assert(y32.cashSurrenderValue.value === 195117, "year 32 CSV");
  assert(y32.deathBenefit.value === 475814, "year 32 DB");
  assert(y40 && y40.sourcePage != null && y40.sourcePage !== 21 && y40.sourcePage !== 22, "year 40 keeps persisted distribution page");
  assert(y40.income.value === 17265 && y40.plannedLoan.value === 27270, "year 40 income/loan");
  assert(y40.accumulatedLoan.value === 209023, "year 40 accumulated loan");
  assert(y40.accountValue.value === 345025, "year 40 AV");
  assert(y40.cashSurrenderValue.value === 136002, "year 40 CSV");
  assert(y40.deathBenefit.value === 285071, "year 40 DB");
  assert(y60 && y60.sourcePage === 27, "year 60 source page 27");
  assert(y60.income.value === 17265 && y60.plannedLoan.value === 85498, "year 60 income/loan");
  assert(y60.accumulatedLoan.value === 1319188, "year 60 accumulated loan");
  assert(y60.accountValue.value === 1338219, "year 60 AV");
  assert(y60.cashSurrenderValue.value === 19031, "year 60 CSV");
  assert(y60.deathBenefit.value === 32414, "year 60 DB");
  assert(y86 && y86.sourcePage === 28, "year 86 source page 28");
  assert(y86.income.value === 17265 && y86.plannedLoan.value === 377676, "year 86 income/loan");
  assert(y86.accumulatedLoan.value === 6889734, "year 86 accumulated loan");
  assert(y86.accountValue.value === 8760818, "year 86 AV");
  assert(y86.cashSurrenderValue.value === 1871085, "year 86 CSV");
  assert(y86.deathBenefit.value === 1871085, "year 86 DB");
  assert(
    y86.accumulatedLoan.value !== y86.accountValue.value - y86.cashSurrenderValue.value,
    "accumulated loan is not AV minus CSV"
  );
  assert(
    !nlReport.economics.policyCostCheckpoints.some((row) => row.accumulatedLoan || row.income || row.plannedLoan),
    "does not merge distribution fields into canonical economics rows"
  );

  const productionShaped = assembleClientPolicyReport({
    extractedData: { carrier: "National Life Group", product: "FlexLife II" },
    annualValues: {
      timeline: [
        {
          policyYear: 1,
          insuredAge: 35,
          annualPremium: 2991.53,
          accountValue: 1921,
          cashSurrenderValue: 0,
          deathBenefit: 294921,
          loan_balance: 0,
          sourcePage: 21
        }
      ],
      metadata: {
        adapterKey: ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL,
        comparisonScenario: "current_illustrated",
        policyCostTerms: lsw.policyCostTerms,
        scenarios: {
          current_illustrated_distributions: [
            {
              policyYear: 1,
              insuredAge: 35,
              annualPremium: 2991.53,
              income: 0,
              plannedLoan: 0,
              accumulatedLoan: 0,
              accountValue: 1921,
              cashSurrenderValue: 0,
              deathBenefit: 294921,
              sourcePage: 25,
              scenario: "current_illustrated_distributions"
            },
            {
              policyYear: 32,
              insuredAge: 66,
              annualPremium: 0,
              income: 17265,
              plannedLoan: 17265,
              accumulatedLoan: 18280,
              accountValue: 213397,
              cashSurrenderValue: 195117,
              deathBenefit: 475814,
              sourcePage: 26,
              scenario: "current_illustrated_distributions"
            },
            {
              policyYear: 40,
              insuredAge: 74,
              annualPremium: 0,
              income: 17265,
              plannedLoan: 27270,
              accumulatedLoan: 209023,
              accountValue: 345025,
              cashSurrenderValue: 136002,
              deathBenefit: 285071,
              sourcePage: 26,
              scenario: "current_illustrated_distributions"
            },
            {
              policyYear: 60,
              insuredAge: 94,
              annualPremium: 0,
              income: 17265,
              plannedLoan: 85498,
              accumulatedLoan: 1319188,
              accountValue: 1338219,
              cashSurrenderValue: 19031,
              deathBenefit: 32414,
              sourcePage: 27,
              scenario: "current_illustrated_distributions"
            },
            {
              policyYear: 86,
              insuredAge: 120,
              annualPremium: 0,
              income: 17265,
              plannedLoan: 377676,
              accumulatedLoan: 6889734,
              accountValue: 8760818,
              cashSurrenderValue: 1871085,
              deathBenefit: 1871085,
              sourcePage: 28,
              scenario: "current_illustrated_distributions"
            }
          ]
        }
      }
    }
  });
  const produced = productionShaped.distributionScenario;
  assert(produced.distributionStartYear === 32, "production-shaped start year 32");
  assert(checkpointByYear(produced.checkpoints, 32).sourcePage === 26, "production year 32 page 26");
  assert(checkpointByYear(produced.checkpoints, 40).sourcePage === 26, "production year 40 page 26");
  assert(checkpointByYear(produced.checkpoints, 60).sourcePage === 27, "production year 60 page 27");
  assert(checkpointByYear(produced.checkpoints, 86).sourcePage === 28, "production year 86 page 28");
  assert(produced.sourcePages.join(",") === "25,26,27,28", "multi-page summary 25–28");

  const loanOnlyCanonical = assembleClientPolicyReport({
    extractedData: { carrier: "National Life Group", product: "FlexLife II" },
    annualValues: {
      timeline: [
        {
          policyYear: 32,
          insuredAge: 66,
          annualPremium: 0,
          accountValue: 213397,
          cashSurrenderValue: 195117,
          deathBenefit: 475814,
          loan_balance: 999999,
          sourcePage: 21
        }
      ],
      metadata: {
        adapterKey: ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL,
        comparisonScenario: "current_illustrated",
        scenarios: {
          current_illustrated: [
            {
              policyYear: 32,
              plannedLoan: 999999,
              accumulatedLoan: 999999,
              accountValue: 213397,
              cashSurrenderValue: 195117,
              deathBenefit: 475814,
              sourcePage: 21
            }
          ]
        }
      }
    }
  });
  assert(
    loanOnlyCanonical.distributionScenario == null,
    "canonical/current_illustrated loans are not distribution evidence"
  );

  const missing = assembleClientPolicyReport({
    review: { id: "empty" },
    extractedData: { carrier: "Unknown", product: "IUL" },
    annualValues: null
  });
  assert(missing.annualValuesAvailable === false, "missing annual values flagged");
  assert(missing.annualValuesUnavailableMessage, "missing values message");
  assert(missing.economics.policyCostCheckpoints.every((row) => row.usedYear == null || row.costOfInsurance.value == null), "no invented timeline");

  const unsupported = assembleClientPolicyReport({
    extractedData: { carrier: "Other" },
    annualValues: { timeline: [], metadata: { adapterKey: "unknown-carrier-xyz" } }
  });
  assert(unsupported.adapter.supported === false, "unknown adapter fail-closed");
  assert(unsupported.economics == null, "does not guess economics");
  assert(/additional review/i.test(unsupported.adapter.message), "unsupported copy");

  console.log("clientPolicyReport.test.js passed");
}

run();
