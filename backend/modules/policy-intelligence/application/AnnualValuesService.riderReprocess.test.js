/**
 * Reprocess must REPLACE extracted_data.riders with the current parse (BR-144).
 * Does not append stale generic riders. No UI hide. No migration.
 */

const fs = require("fs");
const path = require("path");
const {
  AnnualValuesService,
  authoritativeParsedRiders,
  buildIllustrationSetMetadata
} = require("./AnnualValuesService");
const {
  extractIllustrationFromPages,
  ADAPTER_KEYS
} = require("../domain/illustration-extract");
const { nationwideIllustratedPages } = require("../domain/illustration-extract/fixtures/nationwideIulLedgerFixture");
const { lswFlexLifeIi20417FLPages } = require("../domain/illustration-extract/fixtures/lswFlexLifeIi20417FLFixture");
const { RIDER_CATEGORIES } = require("../domain/policy-economics");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const STALE_GENERIC_RIDERS = Object.freeze([
  {
    type: "Terminal Illness",
    name: "Terminal Illness",
    sourcePage: 15,
    minimumDollarAmount: 50000,
    qualifyingTrigger: "terminal_illness_as_described_in_rider"
  },
  {
    type: "Chronic Illness",
    name: "Chronic Illness",
    sourcePage: 15,
    qualifyingTrigger: "chronic_illness_as_described_in_rider"
  },
  {
    type: "Living Benefit",
    name: "Living Benefit",
    sourcePage: 15,
    minimumDollarAmount: 50000,
    qualifyingTrigger: "terminal_illness_as_described_in_rider"
  },
  {
    type: "Critical Illness",
    name: "Critical Illness",
    sourcePage: 16,
    annualLimitPercent: 10,
    annualLimitDollars: 25000
  }
]);

function createReprocessRepository({ extractedData, metadata = {} } = {}) {
  const state = {
    extractionPatch: null,
    updateCount: 0
  };

  return {
    state,
    async getReview() {
      return { id: "review-nw", title: "Nationwide Test-1" };
    },
    async getDocument() {
      return {
        id: "doc-nw",
        mime_type: "application/pdf",
        upload_status: "stored",
        storage_path: "org/doc-nw.pdf"
      };
    },
    async getExtractionByDocument() {
      return {
        id: "extraction-nw",
        extracted_data: extractedData,
        metadata
      };
    },
    async updateExtraction(_organizationId, extractionId, patch) {
      state.updateCount += 1;
      state.extractionPatch = { extractionId, ...patch };
      return { id: extractionId, ...patch };
    }
  };
}

async function run() {
  assert.deepEqual = (actual, expected, message) => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    assert(left === right, message || `${left} !== ${right}`);
  };

  assert.deepEqual(authoritativeParsedRiders([{ type: "Terminal Illness" }]), [{ type: "Terminal Illness" }]);
  assert.deepEqual(authoritativeParsedRiders([]), [], "empty parse persists empty, does not resurrect");
  assert.deepEqual(authoritativeParsedRiders(null), [], "null parse does not resurrect prior riders");
  assert.deepEqual(authoritativeParsedRiders(undefined), [], "missing parse does not resurrect prior riders");

  const nationwide = extractIllustrationFromPages(nationwideIllustratedPages());
  const lsw = extractIllustrationFromPages(lswFlexLifeIi20417FLPages());
  const nwMeta = buildIllustrationSetMetadata(nationwide);
  const lswMeta = buildIllustrationSetMetadata(lsw);

  const terminal = nationwide.riders.find((rider) => rider.type === "Terminal Illness");
  const livingGeneric = nationwide.riders.find((rider) => rider.type === "Living Benefit");
  assert(terminal, "current Nationwide parser returns Terminal Illness");
  assert(!livingGeneric, "current Nationwide parser does not emit generic Living Benefit");
  assert(terminal.formNumber === "ICC13-NWLA-495", "current parser keeps Terminal formNumber");
  assert(terminal.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT, "current parser keeps riderCategory");
  assert(terminal.adapterKey === "nationwide-iul", "current parser keeps adapterKey");
  assert(terminal.minimumDollarAmount !== 50000, "current parser does not keep stale remaining-DB $50,000 as acceleration min");
  assert(
    (nwMeta.riders || []).some((rider) => rider.formNumber === "ICC13-NWLA-495"),
    "annual-set metadata.riders comes from current Nationwide parser"
  );
  assert(
    !(nwMeta.riders || []).some((rider) => rider.type === "Living Benefit"),
    "annual-set metadata does not keep generic Living Benefit unless parser returns it"
  );

  const lswAbr = lsw.riders.find((rider) => rider.formNumber === "8052FL");
  assert(lsw.adapterKey === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL, "National Life adapter unchanged");
  assert(lswAbr, "National Life ABR form 8052FL still extracted");
  assert(
    !(lsw.riders || []).some((rider) => String(rider.formNumber || "").includes("NWLA")),
    "National Life extract does not pick up Nationwide forms"
  );
  assert(lswMeta.riders === lsw.riders, "National Life metadata.riders still the current LSW parse");

  const staleExtracted = {
    carrier: "Nationwide",
    faceAmount: 100000,
    product: "IUL Protector II",
    riders: STALE_GENERIC_RIDERS,
    insuranceFacts: { preserved: true }
  };

  const repo = createReprocessRepository({
    extractedData: staleExtracted,
    metadata: { atlasExtract: true }
  });
  const service = new AnnualValuesService({
    repository: repo,
    downloadPolicyDocument: async () => ({ buffer: Buffer.from("%PDF-stub") })
  });
  service.extractAndPersistFromPdf = async () => ({
    persisted: true,
    riders: nationwide.riders,
    policyCostTerms: nationwide.policyCostTerms || { adapterKey: "nationwide-iul" },
    annualValues: { analysis: { timeline: [{ policyYear: 1, accountValue: 1422 }] } }
  });

  await service.extractAndPersistFromStoredDocument({
    organizationId: "org-1",
    reviewId: "review-nw",
    documentId: "doc-nw"
  });

  assert(repo.state.updateCount === 1, "successful reprocess updates extraction");
  const nextRiders = repo.state.extractionPatch.extracted_data.riders;
  assert(Array.isArray(nextRiders), "riders persisted as array");
  assert(nextRiders === nationwide.riders || nextRiders.length === nationwide.riders.length, "replaced with current parse length");
  assert(
    !nextRiders.some((rider) => rider.type === "Living Benefit"),
    "stale generic Living Benefit does not survive current reprocess"
  );
  assert(
    !nextRiders.some((rider) => rider.type === "Terminal Illness" && Number(rider.minimumDollarAmount) === 50000),
    "old Terminal $50,000 generic artifact is removed when current parser differs"
  );
  const persistedTerminal = nextRiders.find((rider) => rider.type === "Terminal Illness");
  assert(persistedTerminal.formNumber === "ICC13-NWLA-495", "formNumber survives persistence");
  assert(persistedTerminal.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT, "riderCategory survives persistence");
  assert(persistedTerminal.adapterKey === "nationwide-iul", "adapterKey survives persistence");
  assert.deepEqual(
    nextRiders.map((rider) => rider.formNumber),
    nationwide.riders.map((rider) => rider.formNumber),
    "persisted rider forms equal current parser output"
  );
  assert(repo.state.extractionPatch.extracted_data.carrier === "Nationwide", "unrelated extracted_data.carrier intact");
  assert(repo.state.extractionPatch.extracted_data.faceAmount === 100000, "unrelated extracted_data.faceAmount intact");
  assert(repo.state.extractionPatch.extracted_data.insuranceFacts.preserved === true, "unrelated insuranceFacts intact");
  assert(repo.state.extractionPatch.extracted_data.product === "IUL Protector II", "unrelated product intact");

  const nlRepo = createReprocessRepository({
    extractedData: {
      carrier: "National Life Group",
      riders: STALE_GENERIC_RIDERS,
      insuranceFacts: { preserved: true }
    }
  });
  const nlService = new AnnualValuesService({
    repository: nlRepo,
    downloadPolicyDocument: async () => ({ buffer: Buffer.from("%PDF-stub") })
  });
  nlService.extractAndPersistFromPdf = async () => ({
    persisted: true,
    riders: lsw.riders,
    policyCostTerms: lsw.policyCostTerms || null,
    annualValues: { analysis: { timeline: [{ policyYear: 1, accountValue: 1921 }] } }
  });
  await nlService.extractAndPersistFromStoredDocument({
    organizationId: "org-1",
    reviewId: "review-nl",
    documentId: "doc-nl"
  });
  const nlRiders = nlRepo.state.extractionPatch.extracted_data.riders;
  assert(nlRiders.some((rider) => rider.formNumber === "8052FL"), "National Life reprocess still persists 8052FL");
  assert(
    !nlRiders.some((rider) => String(rider.formNumber || "").includes("NWLA")),
    "National Life reprocess does not persist Nationwide forms"
  );
  assert(
    !nlRiders.some((rider) => rider.type === "Living Benefit"),
    "National Life reprocess does not keep stale generic Living Benefit"
  );
  assert(nlRepo.state.extractionPatch.extracted_data.carrier === "National Life Group", "National Life unrelated fields intact");

  const emptyRepo = createReprocessRepository({ extractedData: staleExtracted });
  const emptyService = new AnnualValuesService({
    repository: emptyRepo,
    downloadPolicyDocument: async () => ({ buffer: Buffer.from("%PDF-stub") })
  });
  emptyService.extractAndPersistFromPdf = async () => ({
    persisted: true,
    riders: [],
    policyCostTerms: null,
    annualValues: { analysis: { timeline: [] } }
  });
  await emptyService.extractAndPersistFromStoredDocument({
    organizationId: "org-1",
    reviewId: "review-nw",
    documentId: "doc-nw"
  });
  assert.deepEqual(
    emptyRepo.state.extractionPatch.extracted_data.riders,
    [],
    "successful empty parse does not resurrect stale riders"
  );
  assert(emptyRepo.state.extractionPatch.extracted_data.carrier === "Nationwide", "empty-rider reprocess keeps unrelated fields");

  const failedRepo = createReprocessRepository({ extractedData: staleExtracted });
  const failedService = new AnnualValuesService({
    repository: failedRepo,
    downloadPolicyDocument: async () => ({ buffer: Buffer.from("%PDF-stub") })
  });
  failedService.extractAndPersistFromPdf = async () => ({
    persisted: false,
    reason: "no_annual_ledger_rows",
    riders: []
  });
  await failedService.extractAndPersistFromStoredDocument({
    organizationId: "org-1",
    reviewId: "review-nw",
    documentId: "doc-nw"
  });
  assert(failedRepo.state.updateCount === 0, "failed extract does not rewrite extraction");

  const persistRepo = {
    state: { valueRows: [] },
    async getReview() {
      return { id: "review-nw", title: "Nationwide Test-1" };
    },
    async replaceAnnualValueSet(row) {
      this.state.setRow = { id: "set-nw", ...row };
      this.state.valueRows = [];
      return this.state.setRow;
    },
    async insertAnnualValues(rows) {
      this.state.valueRows = rows || [];
      return this.state.valueRows;
    },
    async getLatestAnnualValueSet() {
      return this.state.setRow;
    },
    async listAnnualValuesForSet() {
      return this.state.valueRows;
    }
  };
  const persistService = new AnnualValuesService({ repository: persistRepo });
  await persistService.upsertForReview({
    organizationId: "org-1",
    reviewId: "review-nw",
    rows: nationwide.engineRows,
    source: "pdf_text_table",
    setMetadata: nwMeta
  });
  assert(Number(persistRepo.state.valueRows[0].account_value) === 1422, "Nationwide year 1 AV unchanged");
  assert(persistRepo.state.setRow.metadata.riders === nwMeta.riders, "upsert metadata.riders is current parser output");

  const serviceSrc = fs.readFileSync(path.join(__dirname, "AnnualValuesService.js"), "utf8");
  assert(serviceSrc.includes("authoritativeParsedRiders(result.riders)"), "reprocess uses replacement helper");
  assert(
    !serviceSrc.includes("...((extraction.extracted_data && extraction.extracted_data.riders) || [])"),
    "reprocess no longer appends prior extracted_data.riders"
  );
  assert(!/ALTER TABLE|CREATE TABLE/.test(serviceSrc), "no migration in AnnualValuesService");

  console.log("AnnualValuesService.riderReprocess.test.js passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
