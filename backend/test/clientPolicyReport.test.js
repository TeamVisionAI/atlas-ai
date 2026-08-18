/**
 * Client-facing Policy Intelligence report assembler (BR-144).
 * No PDF persist. No new financial math.
 */

const { assembleClientPolicyReport } = require("../modules/policy-intelligence/application/assembleClientPolicyReport");
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
    annualValues: asSet(lsw)
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
