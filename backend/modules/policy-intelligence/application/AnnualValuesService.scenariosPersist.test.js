/**
 * Persist parsed illustration scenarios in annual-set JSONB metadata (BR-144).
 * Canonical Current Illustrated engineRows stay the comparison timeline.
 */

const fs = require("fs");
const path = require("path");
const {
  AnnualValuesService,
  serializeIllustrationScenarios,
  buildIllustrationSetMetadata
} = require("./AnnualValuesService");
const {
  extractIllustrationFromPages,
  ADAPTER_KEYS
} = require("../domain/illustration-extract");
const { SCENARIOS } = require("../domain/illustration-extract/adapters/lswFlexLifeIi20417FL");
const { lswFlexLifeIi20417FLPages } = require("../domain/illustration-extract/fixtures/lswFlexLifeIi20417FLFixture");
const { nationwideIllustratedPages } = require("../domain/illustration-extract/fixtures/nationwideIulLedgerFixture");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMemoryRepository(review = { id: "review-nl", title: "National Life Group" }) {
  const state = {
    setRow: null,
    valueRows: [],
    replaceCount: 0
  };

  return {
    state,
    async getReview() {
      return review;
    },
    async replaceAnnualValueSet(row) {
      state.replaceCount += 1;
      state.setRow = {
        id: `set-${state.replaceCount}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...row
      };
      state.valueRows = [];
      return state.setRow;
    },
    async insertAnnualValues(rows) {
      state.valueRows = (rows || []).map((row, index) => ({
        id: `row-${index}`,
        ...row
      }));
      return state.valueRows;
    },
    async getLatestAnnualValueSet() {
      return state.setRow;
    },
    async listAnnualValuesForSet() {
      return state.valueRows;
    }
  };
}

function findYear(rows, year) {
  return (rows || []).find((row) => Number(row.policyYear ?? row.policy_year) === year);
}

async function persistExtracted(extracted, repository) {
  const service = new AnnualValuesService({ repository });
  return service.upsertForReview({
    organizationId: "org-1",
    reviewId: "review-nl",
    rows: extracted.engineRows,
    source: "pdf_text_table",
    setMetadata: buildIllustrationSetMetadata(extracted)
  });
}

async function run() {
  const lsw = extractIllustrationFromPages(lswFlexLifeIi20417FLPages());
  const nationwide = extractIllustrationFromPages(nationwideIllustratedPages());

  assert(lsw.adapterKey === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL, "LSW adapter");
  assert(lsw.comparisonScenario === SCENARIOS.CURRENT_ILLUSTRATED, "canonical comparison is current illustrated");
  assert(nationwide.scenarios == null, "Nationwide extract has no scenarios object");

  const repo = createMemoryRepository();
  const persisted = await persistExtracted(lsw, repo);
  const metadata = repo.state.setRow.metadata;
  const distributions = metadata.scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS];
  const currentIllustratedMeta = metadata.scenarios[SCENARIOS.CURRENT_ILLUSTRATED];

  assert(metadata.scenarios, "extracted.scenarios persists into annual-set metadata");
  assert(Array.isArray(distributions) && distributions.length > 0, "National Life distribution scenario survives persistence");
  assert(
    metadata.comparisonScenario === SCENARIOS.CURRENT_ILLUSTRATED,
    "set comparisonScenario remains current illustrated"
  );

  assert(repo.state.valueRows.length === lsw.engineRows.length, "canonical row count matches engineRows");
  for (const stored of repo.state.valueRows) {
    const engine = lsw.engineRows.find((row) => row.policyYear === stored.policy_year);
    assert(engine, `canonical year ${stored.policy_year} present in engineRows`);
    assert(
      Number(stored.account_value) === Number(engine["Accumulated Value"] ?? engine.accountValue),
      `canonical AV year ${stored.policy_year} unchanged`
    );
    assert(
      Number(stored.cash_surrender_value) === Number(engine["Net Surrender Value"] ?? engine.cashSurrenderValue),
      `canonical CSV year ${stored.policy_year} unchanged`
    );
    assert(
      Number(stored.death_benefit) === Number(engine["Death Benefit"] ?? engine.deathBenefit),
      `canonical DB year ${stored.policy_year} unchanged`
    );
    assert(stored.metadata?.scenario === SCENARIOS.CURRENT_ILLUSTRATED, "canonical row scenario unchanged");
    assert(
      stored.metadata?.sourcePage >= 21 && stored.metadata?.sourcePage <= 24,
      `canonical sourcePage ${stored.metadata?.sourcePage} stays on 21–24`
    );
  }

  const year1Canonical = findYear(lsw.engineRows, 1);
  assert(year1Canonical.plannedLoan === 0 && year1Canonical.loanBalance === 0, "dual-ledger adapter still fills placeholder zeros on engineRows");
  const year1CurrentMeta = findYear(currentIllustratedMeta, 1);
  assert(year1CurrentMeta.plannedLoan === null, "dual-ledger placeholder plannedLoan is not stored as distribution data");
  assert(year1CurrentMeta.accumulatedLoan === null, "dual-ledger placeholder accumulatedLoan is not stored as distribution data");
  assert(
    distributions.every((row) => row.scenario === SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS),
    "distribution scenario identity survives unchanged"
  );
  assert(
    !distributions.some((row) => row.plannedLoan === 0 && row.policyYear === 32),
    "year 32 distribution loan is not the dual-ledger placeholder"
  );

  const year32 = findYear(distributions, 32);
  assert(year32, "year 32 distribution row persisted");
  assert(year32.income === 17265, `year 32 income ${year32.income}`);
  assert(year32.plannedLoan === 17265, `year 32 plannedLoan ${year32.plannedLoan}`);
  assert(year32.accumulatedLoan === 18280, `year 32 accumulatedLoan ${year32.accumulatedLoan}`);
  assert(year32.accountValue === 213397, `year 32 AV ${year32.accountValue}`);
  assert(year32.cashSurrenderValue === 195117, `year 32 CSV ${year32.cashSurrenderValue}`);
  assert(year32.deathBenefit === 475814, `year 32 DB ${year32.deathBenefit}`);
  assert(year32.sourcePage === 26, `year 32 sourcePage ${year32.sourcePage}`);
  assert(year32.scenario === SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS, "year 32 scenario");

  const year40 = findYear(distributions, 40);
  assert(year40.income === 17265, "year 40 income");
  assert(year40.plannedLoan === 27270, `year 40 plannedLoan ${year40.plannedLoan}`);
  assert(year40.accumulatedLoan === 209023, `year 40 accumulatedLoan ${year40.accumulatedLoan}`);
  assert(year40.accountValue === 345025, "year 40 AV");
  assert(year40.cashSurrenderValue === 136002, "year 40 CSV");
  assert(year40.deathBenefit === 285071, "year 40 DB");
  assert(year40.sourcePage === 27, `year 40 sourcePage ${year40.sourcePage}`);

  const year60 = findYear(distributions, 60);
  assert(year60.income === 17265, "year 60 income");
  assert(year60.plannedLoan === 85498, `year 60 plannedLoan ${year60.plannedLoan}`);
  assert(year60.accumulatedLoan === 1319188, `year 60 accumulatedLoan ${year60.accumulatedLoan}`);
  assert(year60.accountValue === 1338219, "year 60 AV");
  assert(year60.cashSurrenderValue === 19031, "year 60 CSV");
  assert(year60.deathBenefit === 32414, "year 60 DB");
  assert(year60.sourcePage === 27, `year 60 sourcePage ${year60.sourcePage}`);

  const year86 = findYear(distributions, 86);
  assert(year86.income === 17265, "year 86 income");
  assert(year86.plannedLoan === 377676, `year 86 plannedLoan ${year86.plannedLoan}`);
  assert(year86.accumulatedLoan === 6889734, `year 86 accumulatedLoan ${year86.accumulatedLoan}`);
  assert(year86.accountValue === 8760818, "year 86 AV");
  assert(year86.cashSurrenderValue === 1871085, "year 86 CSV");
  assert(year86.deathBenefit === 1871085, "year 86 DB");
  assert(year86.sourcePage === 28, `year 86 sourcePage ${year86.sourcePage}`);
  assert(year86.scenario === SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS, "year 86 scenario");

  const year1Dist = findYear(distributions, 1);
  assert(year1Dist.plannedLoan === 0 && year1Dist.accumulatedLoan === 0, "explicit distribution-ledger zeros are kept");
  assert(year1Dist.sourcePage === 25, "year 1 distribution page");

  const avMinusCsv = year86.accountValue - year86.cashSurrenderValue;
  assert(year86.accumulatedLoan !== avMinusCsv, "does not persist debt as AV - CSV");

  const second = await persistExtracted(lsw, repo);
  assert(repo.state.replaceCount === 2, "re-extract replaces the annual set");
  assert(second.persisted.metadata.scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS], "re-extract keeps distribution metadata");
  assert(findYear(second.persisted.metadata.scenarios[SCENARIOS.CURRENT_ILLUSTRATED_DISTRIBUTIONS], 32).plannedLoan === 17265, "re-extract keeps exact loans");
  assert(repo.state.valueRows[0].account_value === 1921, "re-extract does not change canonical Current Illustrated AV");

  const nwRepo = createMemoryRepository({ id: "review-nw", title: "Nationwide Test-1" });
  await persistExtracted(nationwide, nwRepo);
  assert(nwRepo.state.setRow.metadata.scenarios == null, "Nationwide extraction behavior unchanged: no scenarios metadata");
  assert(nwRepo.state.valueRows.length === nationwide.engineRows.length, "Nationwide canonical length unchanged");
  assert(Number(nwRepo.state.valueRows[0].account_value) === 1422, "Nationwide year 1 AV unchanged");
  assert(Number(nwRepo.state.valueRows[0].cash_surrender_value) === 0, "Nationwide year 1 CSV unchanged");

  const serializedAbsent = serializeIllustrationScenarios(null);
  assert(serializedAbsent == null, "absent scenarios serialize to null, not zeros");

  const serviceSrc = fs.readFileSync(path.join(__dirname, "AnnualValuesService.js"), "utf8");
  assert(serviceSrc.includes("metadata.scenarios") || serviceSrc.includes("scenarios: serializeIllustrationScenarios") || serviceSrc.includes("buildIllustrationSetMetadata"), "persists via set metadata");
  assert(!/ALTER TABLE|CREATE TABLE/.test(serviceSrc), "AnnualValuesService does not require a migration");

  const migrationsDir = path.join(__dirname, "../../../database/migrations");
  const migrationFiles = fs.readdirSync(migrationsDir);
  assert(migrationFiles.includes("024_policy_intelligence_annual_values.sql"), "migration 024 unchanged/present");
  assert(migrationFiles.includes("029_rls_backend_only_public_tables.sql"), "migration 029 unchanged/present");
  assert(
    !migrationFiles.some((name) => /annual.?value|distribution.?ledger|illustration.?scenario/i.test(name) && !/^024_|^029_/.test(name)),
    "no new annual-value/distribution migration file"
  );

  assert(persisted.persisted.metadata.engine, "existing set metadata fields remain");
  console.log("AnnualValuesService.scenariosPersist.test.js passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
