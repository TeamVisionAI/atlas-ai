/**
 * BR-181 — Client Production / Activity Foundation.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const clientProductionApplicationService = require("../application/clientProductionApplicationService");
const followUpApplicationService = require("../application/followUpApplicationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const {
  emptyProduction,
  emptyProductionDetail
} = require("../core/operationalControlPlane");
const {
  PRODUCTION_ACTIVITY_TYPES,
  PRODUCTION_STATUSES,
  createMemoryProductionStore
} = require("../core/clientProduction");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const NAMES = new Map([[USER_A, "Alex Owner"]]);

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
    ...overrides
  };
}

function installStores(clients = [clientSeed()]) {
  const production = createMemoryProductionStore();
  const byId = new Map(clients.map((row) => [row.id, row]));
  clientProductionApplicationService.setStoresForTests({
    production,
    findClient: async (id, organizationId) => {
      const row = byId.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    }
  });
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  return production;
}

test.beforeEach(() => {
  installStores();
});

test.afterEach(() => {
  clientProductionApplicationService.setStoresForTests({});
  followUpApplicationService.setStoreForTests(null);
});

test("create production for a client without inventing an amount", async () => {
  const created = await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.LIFE,
      carrier: "Example Carrier",
      nameById: NAMES
    },
    auth()
  );
  assert.equal(created.clientId, CLIENT_ID);
  assert.equal(created.clientName, "Alex Client");
  assert.equal(created.activityType, "LIFE");
  assert.equal(created.status, "DRAFT");
  assert.equal(created.amount, null);
  assert.equal(created.ownerUserId, USER_A);
  assert.equal(created.ownerName, "Alex Owner");
  assert.equal(created.history[0].type, "created");
  assert.equal(created.history[0].actorName, "Alex Owner");
  assert.match(created.history[0].at, /T/);
  assert.doesNotMatch(created.history[0].actorName, /[0-9a-f]{8}-[0-9a-f]{4}/i);
});

test("production appears in the client profile filter and My Production", async () => {
  const created = await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.ANNUITY,
      amount: 2400,
      nameById: NAMES
    },
    auth()
  );

  const profile = await clientProductionApplicationService.listProduction({
    organizationId: ORG_A,
    authContext: auth(),
    clientId: CLIENT_ID,
    nameById: NAMES
  });
  assert.equal(profile.items.length, 1);
  assert.equal(profile.items[0].id, created.id);
  assert.equal(profile.items[0].amount, 2400);

  const mine = await clientProductionApplicationService.listProduction({
    organizationId: ORG_A,
    authContext: auth(),
    scope: "mine",
    nameById: NAMES
  });
  assert.equal(mine.scope, "mine");
  assert.equal(mine.items.some((item) => item.id === created.id), true);
  assert.equal(mine.counts.submitted, 0);
});

test("team visibility is only allowed through existing hierarchy", async () => {
  const created = await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.INVESTMENT
    },
    auth()
  );

  const peerMine = await clientProductionApplicationService.listProduction({
    organizationId: ORG_A,
    authContext: auth(USER_B),
    scope: "team"
  });
  assert.equal(peerMine.scope, "mine");
  assert.equal(peerMine.items.length, 0);

  await assert.rejects(
    () =>
      clientProductionApplicationService.getProduction(created.id, {
        organizationId: ORG_A,
        authContext: auth(USER_B)
      }),
    (error) => error.statusCode === 404
  );

  const team = await clientProductionApplicationService.listProduction({
    organizationId: ORG_A,
    authContext: auth(USER_B, {
      role: "manager",
      hierarchyMode: "subtree",
      hierarchyUserIds: [USER_B, USER_A]
    }),
    scope: "team"
  });
  assert.equal(team.scope, "team");
  assert.equal(team.items.some((item) => item.id === created.id), true);
});

test("status lifecycle records actor and timestamp history", async () => {
  const created = await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.LIFE,
      nameById: NAMES
    },
    auth()
  );
  const submitted = await clientProductionApplicationService.updateStatus(
    created.id,
    { organizationId: ORG_A, status: PRODUCTION_STATUSES.SUBMITTED, nameById: NAMES },
    auth()
  );
  assert.equal(submitted.status, "SUBMITTED");
  assert.ok(submitted.submittedAt);
  assert.equal(submitted.history.at(-1).type, "status_changed");
  assert.equal(submitted.history.at(-1).actorName, "Alex Owner");
  assert.match(submitted.history.at(-1).at, /T/);

  const issued = await clientProductionApplicationService.updateStatus(
    created.id,
    { organizationId: ORG_A, status: PRODUCTION_STATUSES.ISSUED, nameById: NAMES },
    auth()
  );
  assert.equal(issued.status, "ISSUED");
  assert.ok(issued.issuedAt);
});

test("amount stays nullable and metrics never invent a premium", async () => {
  await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.LIFE,
      status: PRODUCTION_STATUSES.SUBMITTED
    },
    auth()
  );
  await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.OTHER,
      status: PRODUCTION_STATUSES.PAID,
      amount: 150
    },
    auth()
  );

  const listed = await clientProductionApplicationService.listProduction({
    organizationId: ORG_A,
    authContext: auth()
  });
  assert.equal(listed.counts.submitted, 1);
  assert.equal(listed.counts.paid, 1);
  assert.equal(listed.amounts.submitted, null);
  assert.equal(listed.amounts.paid, 150);
  assert.equal(listed.items.find((item) => item.status === "SUBMITTED").amount, null);

  await assert.rejects(
    () =>
      clientProductionApplicationService.createProduction(
        {
          organizationId: ORG_A,
          clientId: CLIENT_ID,
          activityType: PRODUCTION_ACTIVITY_TYPES.LIFE,
          amount: "not-a-number"
        },
        auth()
      ),
    /real number/i
  );
});

test("wrong organization and unauthorized peer fail closed as 404", async () => {
  const created = await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.POLICY_REVIEW
    },
    auth()
  );

  await assert.rejects(
    () =>
      clientProductionApplicationService.getProduction(created.id, {
        organizationId: ORG_B,
        authContext: auth()
      }),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    () =>
      clientProductionApplicationService.updateStatus(
        created.id,
        { organizationId: ORG_A, status: PRODUCTION_STATUSES.CLOSED },
        auth(USER_B)
      ),
    (error) => error.statusCode === 404
  );
});

test("optional client follow-up reuses BR-178 and stays on the client", async () => {
  const created = await clientProductionApplicationService.createProduction(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      activityType: PRODUCTION_ACTIVITY_TYPES.LIFE,
      carrier: "Example Carrier"
    },
    auth()
  );
  const result = await clientProductionApplicationService.createClientFollowUp(
    created.id,
    { organizationId: ORG_A, dueDate: "2026-09-04", notes: "Check issue status" },
    auth()
  );
  assert.equal(result.created, true);
  assert.equal(result.followUp.entityType, "client");
  assert.equal(result.followUp.entityId, CLIENT_ID);

  const queue = await followUpApplicationService.listFollowUps({
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false,
    reference: new Date("2026-09-04T16:00:00.000Z")
  });
  assert.equal(
    queue.items.some((item) => item.entityId === CLIENT_ID && item.entityType === "client"),
    true
  );
});

test("control-plane empty payload has no tenant production", () => {
  const empty = emptyProduction();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.counts.submitted, 0);
  assert.equal(empty.amounts.paid, null);
  assert.equal(emptyProductionDetail().id, null);
});

test("BR-181 routes, migration, and recruiting stay isolated", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/production.js"), "utf8");
  const service = fs.readFileSync(
    path.join(__dirname, "../application/clientProductionApplicationService.js"),
    "utf8"
  );
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/ProductionPage.jsx"), "utf8");
  const clientsPage = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/ClientsPage.jsx"), "utf8");
  const today = fs.readFileSync(
    path.join(__dirname, "../application/todayActionCenterApplicationService.js"),
    "utf8"
  );
  const nav = fs.readFileSync(path.join(__dirname, "../../frontend/src/config/workspaceExperience.js"), "utf8");
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  const interpreter = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/interpreter.js"), "utf8");
  const prospectCenter = fs.readFileSync(path.join(__dirname, "../core/prospectCenterReadModel.js"), "utf8");
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/064_br181_client_production.sql"),
    "utf8"
  );

  assert.match(routes, /operationalControlPlaneEmpty\(emptyProduction\)/);
  assert.match(routes, /organizationGuard\(\)/);
  assert.match(routes, /getTenantOrganizationId/);
  assert.match(routes, /createClientFollowUp/);
  assert.doesNotMatch(routes, /req\.body\.phone|fromPhone|tenantPhone/);
  assert.match(server, /app\.use\("\/api\/production", productionRoutes\)/);
  assert.match(service, /Does not create recruiting prospects/);
  assert.doesNotMatch(service, /loadProductionProspects|\/api\/prospects|recruitAiV2|createProspect/);
  assert.doesNotMatch(service, /createManualFollowUp\(\s*\{[^}]*status/);
  assert.match(page, /getProductionList/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|\/api\/prospects|recruitAiV2/);
  assert.match(clientsPage, /getProductionList\(\{ clientId/);
  assert.doesNotMatch(today, /clientProductionApplicationService|atlas_client_production/);
  assert.match(nav, /"clients",\s*"production"/);
  assert.doesNotMatch(recruitDecision, /clientProductionApplicationService|atlas_client_production/);
  assert.doesNotMatch(interpreter, /clientProductionApplicationService|atlas_client_production/);
  assert.doesNotMatch(prospectCenter, /clientProductionApplicationService|atlas_client_production/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS atlas_client_production/);
  assert.match(migration, /REFERENCES atlas_agenda_clients/);
  assert.match(migration, /REVOKE ALL ON TABLE atlas_client_production FROM anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE atlas_client_production TO service_role/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
