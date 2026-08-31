/**
 * BR-186 — IUL / Policy Review Pipeline V2.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const policyReviewPipelineApplicationService = require("../application/policyReviewPipelineApplicationService");
const followUpApplicationService = require("../application/followUpApplicationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { emptyPolicyReviews, emptyPolicyReviewDetail } = require("../core/operationalControlPlane");
const {
  POLICY_REVIEW_STAGES,
  calculateAnnualizedPremium,
  calculateEstimatedTakeHome,
  createMemoryPolicyReviewStore
} = require("../core/policyReviewPipeline");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const APPT_ID = "61000000-0000-4000-8000-000000000001";
const DOC_REQ_ID = "71000000-0000-4000-8000-000000000001";
const SERVICE_ID = "81000000-0000-4000-8000-000000000001";
const PROD_ID = "91000000-0000-4000-8000-000000000001";
const PROSPECT_ID = "11000000-0000-4000-8000-000000000001";
const NAMES = new Map([[USER_A, "Alex Owner"], [USER_B, "Blair Lead"]]);

function auth(userId = USER_A, extras = {}) {
  return { userId, role: extras.role || "agent", ...extras };
}

function clientSeed(overrides = {}) {
  return {
    id: CLIENT_ID,
    organizationId: ORG_A,
    ownerUserId: USER_A,
    name: "Alex Client",
    phone: "+15550001111",
    preferredLanguage: "en",
    source: "facebook",
    ...overrides
  };
}

function installStores({ appointments = [] } = {}) {
  const pipeline = createMemoryPolicyReviewStore();
  const clients = new Map([[CLIENT_ID, clientSeed()]]);
  const appts = new Map(appointments.map((row) => [row.id, row]));
  const documentRequests = new Map();
  policyReviewPipelineApplicationService.setStoresForTests({
    pipeline,
    findClient: async (id, organizationId) => {
      const row = clients.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    listClientsByIds: async (ids, organizationId) =>
      ids
        .map((id) => clients.get(id))
        .filter((row) => row && row.organizationId === organizationId),
    findAppointment: async (id, organizationId) => {
      const row = appts.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    findDocumentRequest: async (id, { organizationId }) => {
      const row = documentRequests.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    createServiceCase: async () => ({ id: SERVICE_ID }),
    createDocumentRequest: async (input) => {
      const created = {
        id: DOC_REQ_ID,
        organizationId: input.organizationId,
        clientId: input.clientId,
        status: "OPEN"
      };
      documentRequests.set(created.id, created);
      return created;
    },
    createProduction: async () => ({ id: PROD_ID })
  });
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  return { pipeline, documentRequests };
}

test.beforeEach(() => {
  installStores({
    appointments: [
      {
        id: APPT_ID,
        organizationId: ORG_A,
        purpose: "policy_review",
        startDateTime: "2026-09-04T15:00:00.000Z",
        status: "scheduled"
      }
    ]
  });
});

test.afterEach(() => {
  policyReviewPipelineApplicationService.setStoresForTests({});
  followUpApplicationService.setStoreForTests(null);
});

async function createLead(overrides = {}) {
  return policyReviewPipelineApplicationService.createPolicyReview(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      language: "en",
      state: "FL",
      source: "facebook",
      campaign: "iul-review-q3",
      adId: "ad-1",
      adsetId: "adset-1",
      creativeId: "creative-1",
      campaignIntakeCode: "IUL-FL-01",
      nameById: NAMES,
      ...overrides
    },
    auth()
  );
}

test("create policy-review record preserves attribution and links the client", async () => {
  const record = await createLead();
  assert.equal(record.stage, POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD);
  assert.equal(record.clientId, CLIENT_ID);
  assert.equal(record.clientName, "Alex Client");
  assert.equal(record.serviceCaseId, SERVICE_ID);
  assert.equal(record.language, "en");
  assert.equal(record.state, "FL");
  assert.equal(record.source, "facebook");
  assert.equal(record.campaign, "iul-review-q3");
  assert.equal(record.adId, "ad-1");
  assert.equal(record.campaignIntakeCode, "IUL-FL-01");
  assert.ok(record.stageTimestamps.NEW_REVIEW_LEAD);
  assert.equal(record.commissionLabel, "ESTIMATED");
  const mine = await policyReviewPipelineApplicationService.listPolicyReviews({
    organizationId: ORG_A,
    authContext: auth(),
    nameById: NAMES
  });
  assert.equal(mine.scope, "mine");
  assert.equal(mine.items.length, 1);
  assert.equal(mine.metrics.newLeads, 1);
});

test("stage transitions follow the explicit pipeline and reject illegal jumps", async () => {
  const created = await createLead();
  const qualified = await policyReviewPipelineApplicationService.transitionStage(
    created.id,
    { organizationId: ORG_A, stage: POLICY_REVIEW_STAGES.QUALIFIED },
    auth()
  );
  assert.equal(qualified.stage, POLICY_REVIEW_STAGES.QUALIFIED);
  await assert.rejects(
    () =>
      policyReviewPipelineApplicationService.transitionStage(
        created.id,
        { organizationId: ORG_A, stage: POLICY_REVIEW_STAGES.PLACED },
        auth()
      ),
    /Cannot move/
  );
});

test("review appointment linkage books the appointment stage", async () => {
  const created = await createLead();
  const booked = await policyReviewPipelineApplicationService.linkAppointment(
    created.id,
    { organizationId: ORG_A, appointmentId: APPT_ID },
    auth()
  );
  assert.equal(booked.stage, POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED);
  assert.equal(booked.appointmentId, APPT_ID);
});

test("document request and received linkage stay on the review record", async () => {
  const created = await createLead();
  const requested = await policyReviewPipelineApplicationService.requestDocuments(
    created.id,
    { organizationId: ORG_A, title: "Current policy" },
    auth()
  );
  assert.equal(requested.stage, POLICY_REVIEW_STAGES.DOCUMENTS_REQUESTED);
  assert.equal(requested.documentRequestId, DOC_REQ_ID);
  const received = await policyReviewPipelineApplicationService.markDocumentsReceived(
    created.id,
    { organizationId: ORG_A },
    auth()
  );
  assert.equal(received.stage, POLICY_REVIEW_STAGES.DOCUMENTS_RECEIVED);
});

test("review completed and replacement opportunity are explicit only", async () => {
  const created = await createLead();
  await policyReviewPipelineApplicationService.linkAppointment(
    created.id,
    { organizationId: ORG_A, appointmentId: APPT_ID },
    auth()
  );
  await assert.rejects(
    () =>
      policyReviewPipelineApplicationService.recordOutcome(
        created.id,
        { organizationId: ORG_A, outcome: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY },
        auth()
      ),
    /review completed/
  );
  await assert.rejects(
    () =>
      policyReviewPipelineApplicationService.transitionStage(
        created.id,
        { organizationId: ORG_A, stage: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY },
        auth()
      ),
    /explicitly after review/
  );
  const completed = await policyReviewPipelineApplicationService.completeReview(
    created.id,
    { organizationId: ORG_A },
    auth()
  );
  assert.equal(completed.stage, POLICY_REVIEW_STAGES.REVIEW_COMPLETED);
  const replacement = await policyReviewPipelineApplicationService.recordOutcome(
    created.id,
    { organizationId: ORG_A, outcome: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY },
    auth()
  );
  assert.equal(replacement.stage, POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY);
});

test("application submitted and placed capture production fields", async () => {
  const created = await createLead();
  await policyReviewPipelineApplicationService.linkAppointment(
    created.id,
    { organizationId: ORG_A, appointmentId: APPT_ID },
    auth()
  );
  await policyReviewPipelineApplicationService.completeReview(created.id, { organizationId: ORG_A }, auth());
  await policyReviewPipelineApplicationService.recordOutcome(
    created.id,
    { organizationId: ORG_A, outcome: POLICY_REVIEW_STAGES.ADJUST_CURRENT },
    auth()
  );
  const submitted = await policyReviewPipelineApplicationService.submitApplication(
    created.id,
    {
      organizationId: ORG_A,
      carrierProductLabel: "Carrier IUL",
      monthlyPremium: 150,
      commissionLevelPct: 80,
      paidAdvanceFactorPct: 50
    },
    auth()
  );
  assert.equal(submitted.stage, POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED);
  assert.equal(submitted.productionId, PROD_ID);
  assert.equal(submitted.monthlyPremium, 150);
  assert.equal(submitted.annualizedPremium, 1800);
  assert.equal(submitted.estimatedTakeHome, 720);
  assert.equal(submitted.commissionLabel, "ESTIMATED");
  const placed = await policyReviewPipelineApplicationService.markPlaced(
    created.id,
    { organizationId: ORG_A, placedDate: "2026-09-15" },
    auth()
  );
  assert.equal(placed.stage, POLICY_REVIEW_STAGES.PLACED);
  assert.equal(placed.placedDate, "2026-09-15");
});

test("premium and estimated commission calculation is deterministic and not hardcoded", () => {
  assert.equal(calculateAnnualizedPremium(100, null), 1200);
  assert.equal(calculateAnnualizedPremium(100, 1500), 1500);
  assert.equal(calculateEstimatedTakeHome({
    annualizedPremium: 1200,
    commissionLevelPct: 80,
    paidAdvanceFactorPct: 50
  }), 480);
  assert.equal(
    calculateEstimatedTakeHome({ annualizedPremium: 1200, commissionLevelPct: null, paidAdvanceFactorPct: 50 }),
    null
  );
  const source = fs.readFileSync(
    path.join(__dirname, "../core/policyReviewPipeline/calculations.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /=\s*110\b|DEFAULT\s+110\b/);
  assert.doesNotMatch(source, /=\s*75\b|DEFAULT\s+75\b/);
});

test("tenant/user commission config is used when the record has no override", async () => {
  await policyReviewPipelineApplicationService.saveCommissionDefaults(
    {
      organizationId: ORG_A,
      scope: "user",
      commissionLevelPct: 90,
      paidAdvanceFactorPct: 40
    },
    auth()
  );
  const created = await createLead({ monthlyPremium: 200 });
  assert.equal(created.annualizedPremium, 2400);
  assert.equal(created.estimatedTakeHome, 864);
});

test("policy reviews do not create recruiting prospects or touch Recruit AI", async () => {
  const created = await createLead({ linkedProspectId: PROSPECT_ID });
  assert.equal(created.linkedProspectId, PROSPECT_ID);
  const service = fs.readFileSync(
    path.join(__dirname, "../application/policyReviewPipelineApplicationService.js"),
    "utf8"
  );
  const routes = fs.readFileSync(path.join(__dirname, "../routes/policyReviews.js"), "utf8");
  assert.doesNotMatch(service, /require\(["'].*prospect|recruitAiV2|\/api\/prospects|loadProductionProspects/);
  assert.doesNotMatch(routes, /recruitAiV2|\/api\/prospects/);
});

test("same person can exist in recruiting and client/review contexts without cross-routing", async () => {
  const created = await createLead({ linkedProspectId: PROSPECT_ID });
  assert.equal(created.clientId, CLIENT_ID);
  assert.equal(created.linkedProspectId, PROSPECT_ID);
  assert.notEqual(created.clientId, created.linkedProspectId);
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  const interpreter = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/interpreter.js"), "utf8");
  assert.doesNotMatch(recruitDecision, /policyReviewPipeline|atlas_policy_review_pipeline/);
  assert.doesNotMatch(interpreter, /policyReviewPipeline|atlas_policy_review_pipeline/);
});

test("My scope stays personal and Team scope uses hierarchy", async () => {
  const peerClient = {
    id: "32000000-0000-4000-8000-000000000002",
    organizationId: ORG_A,
    ownerUserId: USER_B,
    name: "Blair Client"
  };
  const pipeline = createMemoryPolicyReviewStore();
  policyReviewPipelineApplicationService.setStoresForTests({
    pipeline,
    findClient: async (id, organizationId) => {
      if (id === CLIENT_ID) return clientSeed();
      if (id === peerClient.id && organizationId === ORG_A) return peerClient;
      return null;
    },
    listClientsByIds: async (ids, organizationId) =>
      ids
        .map((id) => (id === CLIENT_ID ? clientSeed() : id === peerClient.id ? peerClient : null))
        .filter((row) => row && row.organizationId === organizationId),
    findAppointment: async () => null,
    createServiceCase: async () => ({ id: SERVICE_ID })
  });
  await policyReviewPipelineApplicationService.createPolicyReview(
    { organizationId: ORG_A, clientId: CLIENT_ID, nameById: NAMES },
    auth(USER_A)
  );
  await policyReviewPipelineApplicationService.createPolicyReview(
    { organizationId: ORG_A, clientId: peerClient.id, ownerUserId: USER_B, nameById: NAMES },
    auth(USER_B)
  );
  const mine = await policyReviewPipelineApplicationService.listPolicyReviews({
    organizationId: ORG_A,
    authContext: auth(USER_A),
    scope: "mine",
    nameById: NAMES
  });
  assert.equal(mine.items.length, 1);
  assert.equal(mine.items[0].ownerUserId, USER_A);
  const team = await policyReviewPipelineApplicationService.listPolicyReviews({
    organizationId: ORG_A,
    authContext: auth(USER_A, {
      role: "agent",
      hierarchyMode: HIERARCHY_MODES.SUBTREE,
      hierarchyUserIds: [USER_A, USER_B]
    }),
    scope: "team",
    nameById: NAMES
  });
  assert.equal(team.scope, "team");
  assert.equal(team.items.length, 2);
});

test("wrong organization and unauthorized peer fail closed as 404", async () => {
  const created = await createLead();
  await assert.rejects(
    () =>
      policyReviewPipelineApplicationService.getPolicyReview(created.id, {
        organizationId: ORG_B,
        authContext: auth()
      }),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    () =>
      policyReviewPipelineApplicationService.getPolicyReview(created.id, {
        organizationId: ORG_A,
        authContext: auth(USER_B)
      }),
    (error) => error.statusCode === 404
  );
});

test("Super Admin control-plane empty payload has no tenant policy reviews", () => {
  const empty = emptyPolicyReviews();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.organizationId, null);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.metrics.placed, 0);
  assert.equal(emptyPolicyReviewDetail().organizationId, null);
});

test("Support Mode stays tenant-bound via organization id", async () => {
  await createLead();
  const bound = await policyReviewPipelineApplicationService.listPolicyReviews({
    organizationId: ORG_A,
    authContext: auth(USER_A, {
      role: "administrator",
      hierarchyMode: HIERARCHY_MODES.ORGANIZATION
    }),
    scope: "team",
    nameById: NAMES
  });
  assert.equal(bound.items.length, 1);
  assert.equal(bound.organizationId, ORG_A);
  const otherTenant = await policyReviewPipelineApplicationService.listPolicyReviews({
    organizationId: ORG_B,
    authContext: auth(USER_A, {
      role: "administrator",
      hierarchyMode: HIERARCHY_MODES.ORGANIZATION
    }),
    scope: "team",
    nameById: NAMES
  });
  assert.equal(otherTenant.items.length, 0);
  assert.equal(otherTenant.organizationId, ORG_B);
});

test("follow-up reuses BR-178 client entity and does not add a Today pipeline kind", async () => {
  const created = await createLead();
  const followUp = await policyReviewPipelineApplicationService.createClientFollowUp(
    created.id,
    { organizationId: ORG_A, dueDate: "2026-09-02", notes: "Call after review" },
    auth()
  );
  assert.equal(followUp.created, true);
  assert.equal(followUp.followUp.entityType, "client");
  assert.equal(followUp.followUp.entityId, CLIENT_ID);
  const today = fs.readFileSync(
    path.join(__dirname, "../application/todayActionCenterApplicationService.js"),
    "utf8"
  );
  assert.doesNotMatch(today, /policy_review_pipeline|policyReviewPipeline/);
});

test("BR-186 routes, migration, and recruiting stay isolated", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/policyReviews.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/067_br186_policy_review_pipeline.sql"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/PolicyReviewsPage.jsx"),
    "utf8"
  );
  assert.match(server, /app\.use\("\/api\/policy-reviews", policyReviewsRoutes\)/);
  assert.match(routes, /operationalControlPlaneEmpty\(emptyPolicyReviews\)/);
  assert.match(migration, /atlas_policy_review_pipeline/);
  assert.match(migration, /atlas_policy_review_commission_defaults/);
  assert.doesNotMatch(migration, /phone TEXT|phone_number/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
  assert.doesNotMatch(page, /110%|75%/);
});
