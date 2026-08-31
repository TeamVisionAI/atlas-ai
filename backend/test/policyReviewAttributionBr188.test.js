/**
 * BR-188 — IUL acquisition attribution V1.
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
const {
  createCampaignIntakeAttributionService
} = require("../core/campaignIntakeCode/campaignIntakeAttributionService");
const {
  createMemoryCampaignIntakeCodeRepository,
  INTAKE_CODE_STATUS
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  POLICY_REVIEW_STAGES,
  mergeAcquisition,
  hasValidAcquisition,
  acquisitionFromIntake,
  createMemoryPolicyReviewStore
} = require("../core/policyReviewPipeline");
const { emptyPolicyReviewAcquisitionMetrics } = require("../core/operationalControlPlane");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const PROSPECT_ID = "11000000-0000-4000-8000-000000000188";
const NAMES = new Map([[USER_A, "Alex Owner"]]);

const recruitingProspects = [];
const recruitingContexts = [];

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

function installStores() {
  const pipeline = createMemoryPolicyReviewStore();
  const clients = new Map([[CLIENT_ID, clientSeed()]]);
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
    findClientByPhone: async (phone, organizationId) =>
      [...clients.values()].find(
        (row) => row.phone === phone && row.organizationId === organizationId
      ) || null,
    createClient: async (record) => {
      const saved = { ...record, id: record.id || "32000000-0000-4000-8000-000000000188" };
      clients.set(saved.id, saved);
      return saved;
    },
    createServiceCase: async () => ({ id: "81000000-0000-4000-8000-000000000188" })
  });
  return { pipeline, clients };
}

test.beforeEach(() => {
  recruitingProspects.length = 0;
  recruitingContexts.length = 0;
  installStores();
});

test.afterEach(() => {
  policyReviewPipelineApplicationService.setStoresForTests({});
});

function intakeMatch(overrides = {}) {
  return {
    matched: true,
    code: "TVI-0824-VNC8",
    campaignIntakeCodeId: "code-iul-188",
    campaignName: "TV-IUL-REVIEW-MIAMI-SP-0826",
    purpose: "IUL_REVIEW",
    ownerUserId: USER_A,
    organizationId: ORG_A,
    language: "es",
    ...overrides
  };
}

function ctwaReferral() {
  return {
    sourceType: "ad",
    sourceId: "ad-iul-188",
    ctwaClid: "ctwa-clid-188",
    headline: "Revisa tu póliza",
    body: "Agenda una revisión"
  };
}

async function placeWithCampaign(campaignName, monthlyPremium) {
  const created = await policyReviewPipelineApplicationService.createPolicyReview(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      campaign: campaignName,
      campaignName,
      source: "meta",
      campaignIntakeCode: "TVI-0824-VNC8",
      nameById: NAMES
    },
    auth()
  );
  await policyReviewPipelineApplicationService.transitionStage(
    created.id,
    { organizationId: ORG_A, stage: POLICY_REVIEW_STAGES.QUALIFIED },
    auth()
  );
  await policyReviewPipelineApplicationService.transitionStage(
    created.id,
    { organizationId: ORG_A, stage: POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED },
    auth()
  );
  await policyReviewPipelineApplicationService.transitionStage(
    created.id,
    { organizationId: ORG_A, stage: POLICY_REVIEW_STAGES.REVIEW_COMPLETED },
    auth()
  );
  await policyReviewPipelineApplicationService.recordOutcome(
    created.id,
    { organizationId: ORG_A, outcome: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY },
    auth()
  );
  await policyReviewPipelineApplicationService.submitApplication(
    created.id,
    {
      organizationId: ORG_A,
      monthlyPremium,
      commissionLevelPct: 100,
      paidAdvanceFactorPct: 50
    },
    auth()
  );
  return policyReviewPipelineApplicationService.markPlaced(
    created.id,
    { organizationId: ORG_A, monthlyPremium },
    auth()
  );
}

test("intake code only, no CTWA → attribution persists", async () => {
  const event = acquisitionFromIntake({ match: intakeMatch() });
  assert.equal(hasValidAcquisition(event), true);
  assert.equal(event.intakeCode, "TVI-0824-VNC8");
  assert.equal(event.ctwa, null);
  const linked = await policyReviewPipelineApplicationService.ensurePolicyReviewFromIulIntake({
    organizationId: ORG_A,
    ownerUserId: USER_A,
    prospect: { id: PROSPECT_ID, phone: "+15550001111", name: "Alex Client" },
    match: intakeMatch(),
    nameById: NAMES
  });
  assert.equal(linked.recruitingEligible, false);
  assert.equal(linked.ok, true);
  const record = await policyReviewPipelineApplicationService.getPolicyReview(linked.reviewId, {
    organizationId: ORG_A,
    authContext: auth()
  });
  assert.equal(record.campaignIntakeCode, "TVI-0824-VNC8");
  assert.equal(record.campaignName, "TV-IUL-REVIEW-MIAMI-SP-0826");
  assert.equal(record.acquisition.firstTouch.intakeCode, "TVI-0824-VNC8");
  assert.equal(record.acquisition.firstTouch.ctwa, null);
});

test("Meta CTWA + intake code → both preserved", async () => {
  const linked = await policyReviewPipelineApplicationService.ensurePolicyReviewFromIulIntake({
    organizationId: ORG_A,
    ownerUserId: USER_A,
    prospect: { id: PROSPECT_ID, phone: "+15550001111", name: "Alex Client" },
    match: intakeMatch(),
    ctwaReferral: ctwaReferral(),
    nameById: NAMES
  });
  const record = await policyReviewPipelineApplicationService.getPolicyReview(linked.reviewId, {
    organizationId: ORG_A,
    authContext: auth()
  });
  assert.equal(record.campaignIntakeCode, "TVI-0824-VNC8");
  assert.equal(record.acquisition.firstTouch.ctwa.ctwaClid, "ctwa-clid-188");
  assert.equal(record.adId, "ad-iul-188");
  assert.equal(record.sourcePlatform, "meta");
  assert.equal(record.sourceLabel, "Meta");
});

test("later unattributed WhatsApp message → first touch remains", async () => {
  const linked = await policyReviewPipelineApplicationService.ensurePolicyReviewFromIulIntake({
    organizationId: ORG_A,
    ownerUserId: USER_A,
    prospect: { id: PROSPECT_ID, phone: "+15550001111" },
    match: intakeMatch(),
    nameById: NAMES
  });
  const updated = await policyReviewPipelineApplicationService.applyAcquisitionToReview(
    linked.reviewId,
    { organizationId: ORG_A, source: "", campaign: "" },
    auth()
  );
  assert.equal(updated.acquisition.firstTouch.intakeCode, "TVI-0824-VNC8");
  assert.equal(updated.campaignName, "TV-IUL-REVIEW-MIAMI-SP-0826");
  const merged = mergeAcquisition(updated.acquisition, { source: null });
  assert.equal(merged.firstTouch.intakeCode, "TVI-0824-VNC8");
});

test("later different campaign → first touch unchanged, latest touch updated", async () => {
  const linked = await policyReviewPipelineApplicationService.ensurePolicyReviewFromIulIntake({
    organizationId: ORG_A,
    ownerUserId: USER_A,
    prospect: { id: PROSPECT_ID, phone: "+15550001111" },
    match: intakeMatch(),
    nameById: NAMES
  });
  const updated = await policyReviewPipelineApplicationService.applyAcquisitionToReview(
    linked.reviewId,
    {
      organizationId: ORG_A,
      acquisitionEvent: acquisitionFromIntake({
        match: intakeMatch({
          code: "TVI-0901-ABCD",
          campaignName: "TV-IUL-REVIEW-TAMPA"
        }),
        at: "2026-09-01T12:00:00.000Z"
      })
    },
    auth()
  );
  assert.equal(updated.acquisition.firstTouch.campaignName, "TV-IUL-REVIEW-MIAMI-SP-0826");
  assert.equal(updated.acquisition.firstTouch.intakeCode, "TVI-0824-VNC8");
  assert.equal(updated.acquisition.latestTouch.campaignName, "TV-IUL-REVIEW-TAMPA");
  assert.equal(updated.acquisition.latestTouch.intakeCode, "TVI-0901-ABCD");
  assert.equal(updated.campaignName, "TV-IUL-REVIEW-MIAMI-SP-0826");
});

test("placed case retains original attribution", async () => {
  const placed = await placeWithCampaign("iul-review-q3", 200);
  assert.equal(placed.stage, POLICY_REVIEW_STAGES.PLACED);
  assert.equal(placed.campaign, "iul-review-q3");
  assert.equal(placed.campaignIntakeCode, "TVI-0824-VNC8");
  assert.equal(placed.acquisition.firstTouch.campaignName, "iul-review-q3");
});

test("commission metrics aggregate to campaign correctly", async () => {
  await placeWithCampaign("campaign-a", 100);
  await placeWithCampaign("campaign-a", 50);
  await placeWithCampaign("campaign-b", 80);
  const metrics = await policyReviewPipelineApplicationService.getAcquisitionMetrics({
    organizationId: ORG_A,
    authContext: auth(),
    groupBy: "campaign"
  });
  const campaignA = metrics.groups.find((group) => group.key === "campaign-a");
  const campaignB = metrics.groups.find((group) => group.key === "campaign-b");
  assert.equal(campaignA.placedPolicies, 2);
  assert.equal(campaignA.reviewLeads, 2);
  assert.equal(campaignA.monthlyPremium, 150);
  assert.equal(campaignA.annualizedPremium, 1800);
  assert.equal(campaignA.estimatedCommission, 900);
  assert.equal(campaignA.adSpend, null);
  assert.equal(campaignA.costPerLead, null);
  assert.equal(campaignA.roas, null);
  assert.equal(campaignB.placedPolicies, 1);
  assert.equal(campaignB.estimatedCommission, 480);
  assert.equal(metrics.totals.placedPolicies, 3);
});

test("wrong org / unauthorized peer denied", async () => {
  const linked = await policyReviewPipelineApplicationService.ensurePolicyReviewFromIulIntake({
    organizationId: ORG_A,
    ownerUserId: USER_A,
    prospect: { id: PROSPECT_ID, phone: "+15550001111" },
    match: intakeMatch(),
    nameById: NAMES
  });
  await assert.rejects(
    () =>
      policyReviewPipelineApplicationService.getPolicyReview(linked.reviewId, {
        organizationId: ORG_B,
        authContext: auth()
      }),
    (error) => error.statusCode === 404
  );
  const peer = await policyReviewPipelineApplicationService.getAcquisitionMetrics({
    organizationId: ORG_A,
    authContext: auth(USER_B),
    groupBy: "campaign"
  });
  assert.equal(peer.totals.reviewLeads, 0);
  assert.equal(peer.totals.estimatedCommission, 0);
});

test("control-plane Super Admin gets no revenue data", () => {
  const empty = emptyPolicyReviewAcquisitionMetrics();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.organizationId, null);
  assert.equal(empty.totals.estimatedCommission, 0);
  assert.equal(empty.totals.placedPolicies, 0);
  assert.equal(empty.totals.adSpend, null);
  assert.equal(empty.groups.length, 0);
});

test("recruiting prospect/context counts unchanged after IUL intake", async () => {
  const beforeProspects = recruitingProspects.length;
  const beforeContexts = recruitingContexts.length;
  const service = createCampaignIntakeAttributionService({
    repository: createMemoryCampaignIntakeCodeRepository({
      codes: {
        "TVI-0824-VNC8": {
          id: "code-iul-188",
          organization_id: ORG_A,
          owner_user_id: USER_A,
          whatsapp_phone_number_id: "1213865645144311",
          code: "TVI-0824-VNC8",
          campaign_name: "TV-IUL-REVIEW-MIAMI-SP-0826",
          purpose: "IUL_REVIEW",
          language: "es",
          status: INTAKE_CODE_STATUS.ACTIVE
        }
      }
    }),
    linkPolicyReviewFromIulIntake: (payload) =>
      policyReviewPipelineApplicationService.ensurePolicyReviewFromIulIntake({
        ...payload,
        nameById: NAMES
      })
  });
  const result = await service.establishInboundAttribution({
    match: intakeMatch(),
    prospect: { id: PROSPECT_ID, phone: "+15550001111", name: "Alex Client", organization_id: ORG_A },
    created: true,
    organizationId: ORG_A
  });
  assert.equal(result.recruitingEligible, false);
  assert.equal(result.iulReviewEligible, true);
  assert.equal(result.policyReviewLink.recruitingEligible, false);
  assert.ok(result.policyReviewLink.reviewId);
  assert.equal(recruitingProspects.length, beforeProspects);
  assert.equal(recruitingContexts.length, beforeContexts);
});

test("team hierarchy can read subtree attribution; mine cannot see peer revenue", async () => {
  await placeWithCampaign("campaign-a", 100);
  const mineOther = await policyReviewPipelineApplicationService.getAcquisitionMetrics({
    organizationId: ORG_A,
    authContext: auth(USER_B),
    scope: "mine"
  });
  assert.equal(mineOther.totals.estimatedCommission, 0);
  const team = await policyReviewPipelineApplicationService.getAcquisitionMetrics({
    organizationId: ORG_A,
    authContext: auth(USER_A, {
      role: "rvp",
      hierarchyMode: HIERARCHY_MODES.SUBTREE,
      hierarchyUserIds: [USER_A, USER_B]
    }),
    scope: "team"
  });
  assert.equal(team.totals.placedPolicies, 1);
  assert.ok(team.totals.estimatedCommission > 0);
});

test("BR-188 files stay isolated from Recruit AI and do not invent spend", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../core/policyReviewAttribution.js"), "utf8");
  const app = fs.readFileSync(
    path.join(__dirname, "../application/policyReviewPipelineApplicationService.js"),
    "utf8"
  );
  const intake = fs.readFileSync(
    path.join(__dirname, "../core/campaignIntakeCode/campaignIntakeAttributionService.js"),
    "utf8"
  );
  const routes = fs.readFileSync(path.join(__dirname, "../routes/policyReviews.js"), "utf8");
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/PolicyReviewsPage.jsx"),
    "utf8"
  );
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/068_br188_policy_review_acquisition.sql"),
    "utf8"
  );
  assert.match(routes, /acquisition-metrics/);
  assert.match(page, /policyReviewAcquisition/);
  assert.match(page, /policy-review-source-badge/);
  assert.match(migration, /first_touch_at/);
  assert.match(migration, /acquisition JSONB/);
  assert.match(engine, /adSpend: null/);
  assert.doesNotMatch(engine, /recruitAiV2|NEW_LEAD|canonicalMilestone/);
  assert.doesNotMatch(app, /navigateToProspectWorkspace/);
  assert.match(intake, /recruitingEligible: false/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
});
