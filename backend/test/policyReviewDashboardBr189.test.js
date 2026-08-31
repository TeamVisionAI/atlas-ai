/**
 * BR-189 — IUL / Policy Review dashboard.
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
  buildFunnel,
  classifyNeedsAction,
  kpiDrilldownFilter
} = require("../core/policyReviewDashboard");
const { emptyPolicyReviewDashboard } = require("../core/operationalControlPlane");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const {
  POLICY_REVIEW_STAGES,
  createMemoryPolicyReviewStore
} = require("../core/policyReviewPipeline");

const ORG_A = "21000000-0000-4000-8000-000000000189";
const ORG_B = "21000000-0000-4000-8000-000000000199";
const USER_A = "41000000-0000-4000-8000-000000000189";
const USER_B = "41000000-0000-4000-8000-000000000289";
const CLIENT_ID = "32000000-0000-4000-8000-000000000189";
const NAMES = new Map([
  [USER_A, "Alex Owner"],
  [USER_B, "Blair Peer"]
]);

const NY_TZ = {
  getOrganizationSettings: () => ({ timezone: "America/New_York" })
};

function auth(userId = USER_A, extras = {}) {
  return { userId, role: extras.role || "agent", ...extras };
}

function clientSeed(overrides = {}) {
  return {
    id: CLIENT_ID,
    organizationId: ORG_A,
    ownerUserId: USER_A,
    name: "Alex Client",
    phone: "+15550001889",
    ...overrides
  };
}

function installStores() {
  const pipeline = createMemoryPolicyReviewStore();
  const clients = new Map([[CLIENT_ID, clientSeed()]]);
  let clientBatchReads = 0;
  policyReviewPipelineApplicationService.setStoresForTests({
    pipeline,
    findClient: async (id, organizationId) => {
      const row = clients.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    listClientsByIds: async (ids, organizationId) => {
      clientBatchReads += 1;
      return ids
        .map((id) => clients.get(id))
        .filter((row) => row && row.organizationId === organizationId);
    },
    createServiceCase: async () => ({ id: "81000000-0000-4000-8000-000000000189" })
  });
  return {
    pipeline,
    clients,
    clientBatchReads: () => clientBatchReads
  };
}

let stores;

test.beforeEach(() => {
  stores = installStores();
});

test.afterEach(() => {
  policyReviewPipelineApplicationService.setStoresForTests({});
});

async function createLead(overrides = {}, actor = auth()) {
  return policyReviewPipelineApplicationService.createPolicyReview(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      language: "es",
      state: "FL",
      source: "meta",
      campaign: "BR189_FIRST",
      campaignName: "BR189_FIRST",
      campaignIntakeCode: "TVI-0831-B189",
      nameById: NAMES,
      ...overrides
    },
    actor
  );
}

async function advance(id, stages, extras = {}) {
  let record = null;
  for (const stage of stages) {
    if (stage === POLICY_REVIEW_STAGES.REVIEW_COMPLETED) {
      record = await policyReviewPipelineApplicationService.completeReview(id, { organizationId: ORG_A }, auth());
      continue;
    }
    if (
      stage === POLICY_REVIEW_STAGES.KEEP_CURRENT ||
      stage === POLICY_REVIEW_STAGES.ADJUST_CURRENT ||
      stage === POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY ||
      stage === POLICY_REVIEW_STAGES.NOT_PROCEEDING
    ) {
      record = await policyReviewPipelineApplicationService.recordOutcome(
        id,
        { organizationId: ORG_A, outcome: stage },
        auth()
      );
      continue;
    }
    if (stage === POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED) {
      record = await policyReviewPipelineApplicationService.submitApplication(
        id,
        {
          organizationId: ORG_A,
          monthlyPremium: extras.monthlyPremium ?? 200,
          annualizedPremium: extras.annualizedPremium ?? 2400,
          commissionLevelPct: extras.commissionLevelPct ?? 110,
          paidAdvanceFactorPct: extras.paidAdvanceFactorPct ?? 75
        },
        auth()
      );
      continue;
    }
    if (stage === POLICY_REVIEW_STAGES.PLACED) {
      record = await policyReviewPipelineApplicationService.markPlaced(id, { organizationId: ORG_A }, auth());
      continue;
    }
    record = await policyReviewPipelineApplicationService.transitionStage(
      id,
      { organizationId: ORG_A, stage, appointmentId: extras.appointmentId },
      auth()
    );
  }
  return record;
}

test("empty tenant dashboard is zeros, not broken, and spend stays null", async () => {
  const dashboard = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_A,
    authContext: auth(),
    range: "all",
    timezoneDeps: NY_TZ
  });
  assert.equal(dashboard.kpis.newReviewLeads, 0);
  assert.equal(dashboard.kpis.estimatedCommission, 0);
  assert.equal(dashboard.kpis.adSpend, null);
  assert.equal(dashboard.kpis.costPerLead, null);
  assert.equal(dashboard.kpis.roas, null);
  assert.equal(dashboard.funnel.length, 7);
  assert.equal(dashboard.funnel[0].count, 0);
  assert.equal(dashboard.attribution.groups.length, 0);
  assert.ok(dashboard.needsAction.every((row) => row.count === 0));
  assert.equal(stores.clientBatchReads(), 0);
});

test("full funnel counts, conversion %, commission, and KEEP_CURRENT is not replacement", async () => {
  const placed = await createLead({ campaign: "campaign-a", campaignName: "campaign-a" });
  await advance(placed.id, [
    POLICY_REVIEW_STAGES.QUALIFIED,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
    POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
    POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY,
    POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED,
    POLICY_REVIEW_STAGES.PLACED
  ]);

  const keep = await createLead({ campaign: "campaign-b", campaignName: "campaign-b" });
  await advance(keep.id, [
    POLICY_REVIEW_STAGES.QUALIFIED,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
    POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
    POLICY_REVIEW_STAGES.KEEP_CURRENT
  ]);

  const dashboard = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_A,
    authContext: auth(),
    range: "all",
    groupBy: "campaign",
    timezoneDeps: NY_TZ
  });

  assert.equal(dashboard.kpis.newReviewLeads, 2);
  assert.equal(dashboard.kpis.qualified, 2);
  assert.equal(dashboard.kpis.appointmentsBooked, 2);
  assert.equal(dashboard.kpis.reviewsCompleted, 2);
  assert.equal(dashboard.kpis.replacementOpportunities, 1);
  assert.equal(dashboard.kpis.applicationsSubmitted, 1);
  assert.equal(dashboard.kpis.placed, 1);
  assert.equal(dashboard.kpis.monthlyPremium, 200);
  assert.equal(dashboard.kpis.annualizedPremium, 2400);
  assert.equal(dashboard.kpis.estimatedCommission, 1980);
  assert.equal(dashboard.kpis.adSpend, null);

  const funnel = dashboard.funnel;
  assert.equal(funnel[0].stage, "NEW_REVIEW_LEAD");
  assert.equal(funnel[0].count, 2);
  assert.equal(funnel[0].conversionFromPrevious, null);
  assert.equal(funnel[1].count, 2);
  assert.equal(funnel[1].conversionFromPrevious, 100);
  assert.equal(funnel[4].stage, "REPLACEMENT_OPPORTUNITY");
  assert.equal(funnel[4].count, 1);
  assert.equal(funnel[4].conversionFromPrevious, 50);
  assert.equal(funnel[6].count, 1);

  const campaignA = dashboard.attribution.groups.find((group) => group.key === "campaign-a");
  const campaignB = dashboard.attribution.groups.find((group) => group.key === "campaign-b");
  assert.equal(campaignA.placedPolicies, 1);
  assert.equal(campaignA.estimatedCommission, 1980);
  assert.equal(campaignA.replacementOpportunities, 1);
  assert.equal(campaignB.reviewLeads, 1);
  assert.equal(campaignB.replacementOpportunities, 0);
  assert.equal(campaignB.placedPolicies, 0);
  assert.equal(stores.clientBatchReads(), 0);
});

test("needs-action uses current stage and does not count KEEP_CURRENT as replacement work", async () => {
  const fresh = await createLead();
  const qualified = await advance((await createLead()).id, [POLICY_REVIEW_STAGES.QUALIFIED]);
  const booked = await advance((await createLead()).id, [
    POLICY_REVIEW_STAGES.QUALIFIED,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED
  ], {
    appointmentId: "61000000-0000-4000-8000-000000000189"
  });
  const docs = await advance((await createLead()).id, [
    POLICY_REVIEW_STAGES.QUALIFIED,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
    POLICY_REVIEW_STAGES.DOCUMENTS_REQUESTED
  ]);
  const completed = await advance((await createLead()).id, [
    POLICY_REVIEW_STAGES.QUALIFIED,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
    POLICY_REVIEW_STAGES.REVIEW_COMPLETED
  ]);
  const counts = classifyNeedsAction([fresh, qualified, booked, docs, completed]);
  assert.equal(counts.newLeadsUnworked, 1);
  assert.equal(counts.qualifiedWithoutAppointment, 1);
  assert.equal(counts.appointmentsUpcoming, 1);
  assert.equal(counts.documentsRequested, 1);
  assert.equal(counts.reviewsAwaitingOutcome, 1);
  assert.equal(counts.replacementWithoutApplication, 0);
});

test("date-range filtering uses tenant timezone boundary", async () => {
  const beforeNyMidnight = await createLead({ campaign: "old" });
  const afterNyMidnight = await createLead({ campaign: "new" });
  await stores.pipeline.save({
    ...(await stores.pipeline.findById(beforeNyMidnight.id, ORG_A)),
    createdAt: "2026-08-01T03:59:59.000Z"
  });
  await stores.pipeline.save({
    ...(await stores.pipeline.findById(afterNyMidnight.id, ORG_A)),
    createdAt: "2026-08-01T04:00:00.000Z"
  });

  const today = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_A,
    authContext: auth(),
    range: "custom",
    from: "2026-08-01",
    to: "2026-08-01",
    timezoneDeps: NY_TZ
  });
  assert.equal(today.range.timezone, "America/New_York");
  assert.equal(today.kpis.newReviewLeads, 1);
  const listed = await policyReviewPipelineApplicationService.listPolicyReviews({
    organizationId: ORG_A,
    authContext: auth(),
    range: "custom",
    from: "2026-08-01",
    to: "2026-08-01",
    timezoneDeps: NY_TZ,
    nameById: NAMES
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].id, afterNyMidnight.id);
});

test("owner / hierarchy roll-up, wrong org, and unauthorized peer stay isolated", async () => {
  const mine = await createLead({ campaign: "owner-a" });
  await advance(mine.id, [
    POLICY_REVIEW_STAGES.QUALIFIED,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
    POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
    POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY,
    POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED,
    POLICY_REVIEW_STAGES.PLACED
  ]);
  const peerDash = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_A,
    authContext: auth(USER_B),
    range: "all",
    timezoneDeps: NY_TZ
  });
  assert.equal(peerDash.kpis.estimatedCommission, 0);
  assert.equal(peerDash.kpis.newReviewLeads, 0);

  const team = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_A,
    authContext: auth(USER_A, {
      role: "rvp",
      hierarchyMode: HIERARCHY_MODES.SUBTREE,
      hierarchyUserIds: [USER_A, USER_B]
    }),
    scope: "team",
    range: "all",
    groupBy: "owner",
    nameById: NAMES,
    timezoneDeps: NY_TZ
  });
  assert.equal(team.kpis.placed, 1);
  assert.equal(team.kpis.estimatedCommission, 1980);
  const ownerGroup = team.attribution.groups.find((group) => group.key === USER_A);
  assert.equal(ownerGroup.placedPolicies, 1);

  const wrongOrg = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_B,
    authContext: auth(),
    range: "all",
    timezoneDeps: NY_TZ
  });
  assert.equal(wrongOrg.kpis.newReviewLeads, 0);
});

test("control-plane Super Admin dashboard is empty", () => {
  const empty = emptyPolicyReviewDashboard();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.organizationId, null);
  assert.equal(empty.kpis.estimatedCommission, 0);
  assert.equal(empty.kpis.adSpend, null);
  assert.equal(empty.attribution.groups.length, 0);
  assert.ok(empty.needsAction.every((row) => row.count === 0));
});

test("representative large dataset aggregates without client N+1", async () => {
  for (let i = 0; i < 220; i += 1) {
    await stores.pipeline.save({
      id: `br189-large-${i}`,
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      ownerUserId: i % 2 === 0 ? USER_A : USER_B,
      stage: i % 11 === 0 ? POLICY_REVIEW_STAGES.PLACED : POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD,
      language: i % 2 === 0 ? "es" : "en",
      state: i % 2 === 0 ? "FL" : "TX",
      source: "meta",
      campaign: i % 2 === 0 ? "campaign-a" : "campaign-b",
      campaignName: i % 2 === 0 ? "campaign-a" : "campaign-b",
      monthlyPremium: i % 11 === 0 ? 100 : null,
      annualizedPremium: i % 11 === 0 ? 1200 : null,
      commissionLevelPct: i % 11 === 0 ? 100 : null,
      paidAdvanceFactorPct: i % 11 === 0 ? 50 : null,
      estimatedTakeHome: i % 11 === 0 ? 600 : null,
      stageTimestamps:
        i % 11 === 0
          ? {
              NEW_REVIEW_LEAD: "2026-08-01T12:00:00.000Z",
              QUALIFIED: "2026-08-02T12:00:00.000Z",
              APPOINTMENT_BOOKED: "2026-08-03T12:00:00.000Z",
              REVIEW_COMPLETED: "2026-08-04T12:00:00.000Z",
              REPLACEMENT_OPPORTUNITY: "2026-08-05T12:00:00.000Z",
              APPLICATION_SUBMITTED: "2026-08-06T12:00:00.000Z",
              PLACED: "2026-08-07T12:00:00.000Z"
            }
          : { NEW_REVIEW_LEAD: "2026-08-01T12:00:00.000Z" },
      createdAt: "2026-08-10T15:00:00.000Z",
      updatedAt: "2026-08-10T15:00:00.000Z"
    });
  }
  const before = stores.clientBatchReads();
  const dashboard = await policyReviewPipelineApplicationService.getPolicyReviewDashboard({
    organizationId: ORG_A,
    authContext: auth(USER_A, {
      role: "rvp",
      hierarchyMode: HIERARCHY_MODES.ORGANIZATION
    }),
    scope: "team",
    range: "all",
    groupBy: "campaign",
    timezoneDeps: NY_TZ
  });
  assert.equal(dashboard.kpis.newReviewLeads, 220);
  assert.equal(dashboard.kpis.placed, 20);
  assert.equal(dashboard.kpis.monthlyPremium, 2000);
  assert.equal(dashboard.kpis.estimatedCommission, 12000);
  assert.equal(dashboard.attribution.groups.length, 2);
  assert.equal(stores.clientBatchReads(), before);
  assert.equal(dashboard.kpis.adSpend, null);
});

test("funnel helper and KPI drill-down stay on existing pipeline filters", () => {
  const funnel = buildFunnel({
    reviewLeads: 10,
    qualifiedReviews: 5,
    appointmentsBooked: 4,
    reviewsCompleted: 2,
    replacementOpportunities: 1,
    applicationsSubmitted: 1,
    placedPolicies: 1
  });
  assert.equal(funnel[1].conversionFromPrevious, 50);
  assert.equal(funnel[3].conversionFromPrevious, 50);
  assert.deepEqual(kpiDrilldownFilter("placed"), { stage: "PLACED" });
  assert.deepEqual(kpiDrilldownFilter("newReviewLeads"), {});
});

test("dashboard files reuse Policy Reviews and do not mix recruiting or fabricate spend", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../core/policyReviewDashboard.js"), "utf8");
  const app = fs.readFileSync(
    path.join(__dirname, "../application/policyReviewPipelineApplicationService.js"),
    "utf8"
  );
  const routes = fs.readFileSync(path.join(__dirname, "../routes/policyReviews.js"), "utf8");
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/PolicyReviewsPage.jsx"),
    "utf8"
  );
  const nav = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/config/workspaceExperience.js"),
    "utf8"
  );
  assert.match(routes, /\/dashboard/);
  assert.match(app, /getPolicyReviewDashboard/);
  assert.match(page, /getPolicyReviewDashboard/);
  assert.match(page, /policyReviewViewDashboard/);
  assert.doesNotMatch(nav, /IUL Dashboard|Revenue Dashboard|Acquisition Dashboard|IUL Leads/);
  assert.doesNotMatch(engine, /recruitAiV2|navigateToProspectWorkspace|\/api\/prospects/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
  assert.match(engine, /adSpend: null/);
});
