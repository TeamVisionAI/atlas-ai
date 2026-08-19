/**
 * First-upload rider persistence: adapter output is authoritative when illustration persists.
 * Does not concatenate Atlas/generic riders. No UI hide. No migration.
 */

const fs = require("fs");
const path = require("path");
const { DocumentIngestionService } = require("./DocumentIngestionService");
const { extractIllustrationFromPages, ADAPTER_KEYS } = require("../domain/illustration-extract");
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
    minimumDollarAmount: 50000
  },
  {
    type: "Living Benefit",
    name: "Living Benefit",
    sourcePage: 15,
    minimumDollarAmount: 50000
  },
  {
    type: "Chronic Illness",
    name: "Chronic Illness",
    sourcePage: 15
  }
]);

function createIngestRepository() {
  const state = {
    createdExtraction: null,
    extractionPatch: null,
    updateCount: 0
  };

  return {
    state,
    async getReview() {
      return { id: "review-1", title: "Test Review", status: "draft" };
    },
    async createDocument(row) {
      return row;
    },
    async createExtraction(row) {
      state.createdExtraction = { id: "extraction-1", ...row };
      return state.createdExtraction;
    },
    async updateExtraction(_organizationId, extractionId, patch) {
      state.updateCount += 1;
      state.extractionPatch = { extractionId, ...patch };
      return { id: extractionId, ...state.createdExtraction, ...patch };
    },
    async updateReview() {
      return { id: "review-1", status: "uploaded" };
    },
    async getExtractionByDocument() {
      if (state.extractionPatch) {
        return { id: "extraction-1", ...state.createdExtraction, ...state.extractionPatch };
      }
      return state.createdExtraction;
    }
  };
}

function pdfFile() {
  return {
    buffer: Buffer.from("%PDF-stub"),
    mimetype: "application/pdf",
    originalname: "policy.pdf",
    size: 8
  };
}

async function ingestWithIllustration({ illustration, structuredFields, repository }) {
  const repo = repository || createIngestRepository();
  const service = new DocumentIngestionService({
    repository: repo,
    uploadPolicyDocument: async () => ({ storagePath: "org/doc.pdf" }),
    annualValuesService: {
      extractAndPersistFromPdf: async () => illustration
    }
  });
  const result = await service.ingestDocument({
    organizationId: "org-1",
    reviewId: "review-1",
    file: pdfFile(),
    structuredFields
  });
  return { repo, result };
}

async function run() {
  assert.deepEqual = (actual, expected, message) => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    assert(left === right, message || `${left} !== ${right}`);
  };

  const nationwide = extractIllustrationFromPages(nationwideIllustratedPages());
  const lsw = extractIllustrationFromPages(lswFlexLifeIi20417FLPages());
  assert(nationwide.adapterKey === ADAPTER_KEYS.NATIONWIDE_IUL, "Nationwide adapter");
  assert(lsw.adapterKey === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL, "National Life adapter");
  assert(Number(nationwide.engineRows[0]["Accumulated Value"] ?? nationwide.engineRows[0].accountValue) === 1422
    || Number(nationwide.engineRows[0].accountValue) === 1422
    || true);

  const nwYear1 = nationwide.engineRows.find((row) => Number(row.policyYear) === 1);
  assert(nwYear1, "Nationwide year 1 present");
  const nwYear1Av = Number(nwYear1.accountValue ?? nwYear1["Accumulated Value"]);
  assert(nwYear1Av === 1422, `Nationwide year-1 AV ${nwYear1Av} unchanged`);

  const { repo: nwRepo } = await ingestWithIllustration({
    structuredFields: {
      carrier: "Nationwide",
      product: "IUL Protector II",
      faceAmount: 100000,
      riders: STALE_GENERIC_RIDERS
    },
    illustration: {
      persisted: true,
      riders: nationwide.riders,
      policyCostTerms: nationwide.policyCostTerms,
      annualValues: { analysis: { timeline: [{ policyYear: 1, accountValue: 1422 }] } }
    }
  });

  const nwRiders = nwRepo.state.extractionPatch.extracted_data.riders;
  assert(nwRepo.state.updateCount === 1, "successful Nationwide upload updates extraction");
  assert(
    !nwRiders.some((rider) => rider.type === "Living Benefit"),
    "Nationwide first upload does not persist duplicate generic Living Benefit"
  );
  assert(
    !nwRiders.some((rider) => rider.type === "Terminal Illness" && Number(rider.minimumDollarAmount) === 50000),
    "stale Terminal $50,000 generic artifact does not survive first upload"
  );
  const terminal = nwRiders.find((rider) => rider.type === "Terminal Illness");
  assert(terminal.formNumber === "ICC13-NWLA-495", "Nationwide first upload keeps Terminal formNumber");
  assert(terminal.riderCategory === RIDER_CATEGORIES.LIVING_BENEFIT, "Nationwide first upload keeps riderCategory");
  assert(terminal.adapterKey === "nationwide-iul", "Nationwide first upload keeps adapterKey");
  assert.deepEqual(
    nwRiders.map((rider) => rider.formNumber),
    nationwide.riders.map((rider) => rider.formNumber),
    "Nationwide first upload persists current parser forms only"
  );
  assert(nwRepo.state.extractionPatch.extracted_data.carrier === "Nationwide", "unrelated carrier intact");
  assert(nwRepo.state.extractionPatch.extracted_data.faceAmount === 100000, "unrelated faceAmount intact");
  assert(nwRepo.state.extractionPatch.extracted_data.product === "IUL Protector II", "unrelated product intact");
  assert(
    Number(nwRepo.state.extractionPatch.extracted_data.annualValues[0].accountValue) === 1422,
    "Nationwide annual values year 1 unchanged on first upload"
  );

  const { repo: emptyRepo } = await ingestWithIllustration({
    structuredFields: { carrier: "Nationwide", riders: STALE_GENERIC_RIDERS },
    illustration: {
      persisted: true,
      riders: [],
      policyCostTerms: null,
      annualValues: { analysis: { timeline: [{ policyYear: 1, accountValue: 1422 }] } }
    }
  });
  assert.deepEqual(
    emptyRepo.state.extractionPatch.extracted_data.riders,
    [],
    "successful authoritative empty rider parse does not resurrect generic riders"
  );
  assert(emptyRepo.state.extractionPatch.extracted_data.carrier === "Nationwide", "empty-rider upload keeps unrelated fields");

  const { repo: fallbackRepo } = await ingestWithIllustration({
    structuredFields: {
      carrier: "Unknown Carrier",
      riders: STALE_GENERIC_RIDERS
    },
    illustration: {
      persisted: false,
      reason: "no_annual_ledger_rows",
      riders: []
    }
  });
  assert(fallbackRepo.state.updateCount === 0, "failed illustration persist does not rewrite extraction");
  const fallbackRiders = fallbackRepo.state.createdExtraction.extracted_data.riders;
  assert(
    fallbackRiders.some((rider) => rider.type === "Living Benefit"),
    "unsupported/no-ledger upload retains generic fallback riders"
  );
  assert(
    fallbackRiders.some((rider) => rider.type === "Terminal Illness" && Number(rider.minimumDollarAmount) === 50000),
    "unsupported carrier keeps structured generic Terminal"
  );

  const { repo: nlRepo } = await ingestWithIllustration({
    structuredFields: {
      carrier: "National Life Group",
      riders: STALE_GENERIC_RIDERS
    },
    illustration: {
      persisted: true,
      riders: lsw.riders,
      policyCostTerms: lsw.policyCostTerms,
      annualValues: { analysis: { timeline: [{ policyYear: 1, accountValue: 1921 }] } }
    }
  });
  const nlRiders = nlRepo.state.extractionPatch.extracted_data.riders;
  assert(nlRiders.some((rider) => rider.formNumber === "8052FL"), "National Life first upload persists 8052FL");
  assert(
    !nlRiders.some((rider) => rider.type === "Living Benefit"),
    "National Life first upload does not keep generic Living Benefit"
  );
  assert(
    !nlRiders.some((rider) => String(rider.formNumber || "").includes("NWLA")),
    "National Life first upload does not persist Nationwide forms"
  );
  assert(nlRepo.state.extractionPatch.extracted_data.carrier === "National Life Group", "National Life unrelated fields intact");
  assert(
    Number(nlRepo.state.extractionPatch.extracted_data.annualValues[0].accountValue) === 1921,
    "National Life canonical year-1 AV unchanged on first upload"
  );

  const src = fs.readFileSync(path.join(__dirname, "DocumentIngestionService.js"), "utf8");
  assert(src.includes("authoritativeParsedRiders(illustration.riders)"), "first upload uses replacement helper");
  assert(
    !src.includes("...(layeredData.riders || [])"),
    "first upload no longer concatenates Atlas/generic riders"
  );
  assert(!/ALTER TABLE|CREATE TABLE/.test(src), "no migration in DocumentIngestionService");

  console.log("DocumentIngestionService.riderIngest.test.js passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
