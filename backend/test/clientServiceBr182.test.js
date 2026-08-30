/**
 * BR-182 — Client Service / Policy Review Workspace.
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

const clientServiceApplicationService = require("../application/clientServiceApplicationService");
const followUpApplicationService = require("../application/followUpApplicationService");
const todayService = require("../application/todayActionCenterApplicationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const { emptyServiceCases, emptyServiceCaseDetail } = require("../core/operationalControlPlane");
const {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  SERVICE_DUE_STATUSES,
  createMemoryServiceStore
} = require("../core/clientService");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const APPT_ID = "61000000-0000-4000-8000-000000000001";
const NAMES = new Map([[USER_A, "Alex Owner"]]);
const TODAY = "2026-08-30";

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

function installStores({ appointments = [] } = {}) {
  const service = createMemoryServiceStore();
  const clients = new Map([[CLIENT_ID, clientSeed()]]);
  const appts = new Map(appointments.map((row) => [row.id, row]));
  clientServiceApplicationService.setStoresForTests({
    service,
    findClient: async (id, organizationId) => {
      const row = clients.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    findAppointment: async (id, organizationId) => {
      const row = appts.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    findProduction: async () => null
  });
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  return service;
}

test.beforeEach(() => {
  installStores({
    appointments: [
      {
        id: APPT_ID,
        organizationId: ORG_A,
        startDateTime: "2026-09-04T15:00:00.000Z",
        status: "scheduled"
      }
    ]
  });
});

test.afterEach(() => {
  clientServiceApplicationService.setStoresForTests({});
  followUpApplicationService.setStoreForTests(null);
  todayService.setSourcesForTests(null);
});

test("create service case appears on the client profile and My Service", async () => {
  const created = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      serviceType: SERVICE_TYPES.POLICY_REVIEW,
      title: "Annual policy review",
      nameById: NAMES,
      reference: new Date("2026-08-30T16:00:00.000Z")
    },
    auth()
  );
  assert.equal(created.clientId, CLIENT_ID);
  assert.equal(created.serviceType, "POLICY_REVIEW");
  assert.equal(created.status, "OPEN");
  assert.equal(created.dueDate, null);
  assert.equal(created.dueStatus, SERVICE_DUE_STATUSES.NEEDS_DATE);
  assert.equal(created.history[0].type, "created");
  assert.equal(created.history[0].actorName, "Alex Owner");

  const profile = await clientServiceApplicationService.listServiceCases({
    organizationId: ORG_A,
    authContext: auth(),
    clientId: CLIENT_ID,
    nameById: NAMES,
    reference: new Date(`${TODAY}T16:00:00.000Z`)
  });
  assert.equal(profile.items.some((item) => item.id === created.id), true);

  const mine = await clientServiceApplicationService.listServiceCases({
    organizationId: ORG_A,
    authContext: auth(),
    scope: "mine",
    reference: new Date(`${TODAY}T16:00:00.000Z`)
  });
  assert.equal(mine.scope, "mine");
  assert.equal(mine.items.some((item) => item.id === created.id), true);
});

test("due dates classify as Needs Date, Due Today, Overdue, and Upcoming without inventing dates", async () => {
  const undated = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Needs a date",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  const dueToday = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Due today",
      dueDate: TODAY,
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  const overdue = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Overdue",
      dueDate: "2026-08-20",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  const upcoming = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Upcoming",
      dueDate: "2026-09-10",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  assert.equal(undated.dueStatus, "needs-date");
  assert.equal(dueToday.dueStatus, "due-today");
  assert.equal(overdue.dueStatus, "overdue");
  assert.equal(upcoming.dueStatus, "upcoming");
  assert.equal(undated.dueDate, null);
});

test("team visibility is only allowed through existing hierarchy", async () => {
  const created = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Owner case"
    },
    auth()
  );
  await assert.rejects(
    () =>
      clientServiceApplicationService.getServiceCase(created.id, {
        organizationId: ORG_A,
        authContext: auth(USER_B)
      }),
    (error) => error.statusCode === 404
  );
  const peerTeam = await clientServiceApplicationService.listServiceCases({
    organizationId: ORG_A,
    authContext: auth(USER_B),
    scope: "team"
  });
  assert.equal(peerTeam.scope, "mine");
  const team = await clientServiceApplicationService.listServiceCases({
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

test("status lifecycle and appointment link record actor/timestamp history", async () => {
  const created = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Review packet",
      nameById: NAMES
    },
    auth()
  );
  const waiting = await clientServiceApplicationService.updateStatus(
    created.id,
    { organizationId: ORG_A, status: SERVICE_STATUSES.WAITING_ON_CLIENT, nameById: NAMES },
    auth()
  );
  assert.equal(waiting.status, "WAITING_ON_CLIENT");
  assert.equal(waiting.history.at(-1).type, "status_changed");
  assert.equal(waiting.history.at(-1).actorName, "Alex Owner");

  const linked = await clientServiceApplicationService.updateServiceCase(
    created.id,
    { organizationId: ORG_A, scheduledAppointmentId: APPT_ID, nameById: NAMES },
    auth()
  );
  assert.equal(linked.scheduledAppointmentId, APPT_ID);
  assert.equal(linked.history.at(-1).type, "appointment_linked");

  const completed = await clientServiceApplicationService.updateStatus(
    created.id,
    { organizationId: ORG_A, status: SERVICE_STATUSES.COMPLETED, nameById: NAMES },
    auth()
  );
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.dueStatus, "closed");
  assert.ok(completed.completedAt);
  assert.equal(completed.history.at(-1).type, "completed");
});

test("optional client follow-up reuses BR-178 and status changes do not auto-create follow-ups", async () => {
  const created = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Docs"
    },
    auth()
  );
  await clientServiceApplicationService.updateStatus(
    created.id,
    { organizationId: ORG_A, status: SERVICE_STATUSES.WAITING_ON_CLIENT },
    auth()
  );
  const before = await followUpApplicationService.listFollowUps({
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false
  });
  assert.equal(before.items.length, 0);

  const result = await clientServiceApplicationService.createClientFollowUp(
    created.id,
    { organizationId: ORG_A, dueDate: "2026-09-04", notes: "Check documents" },
    auth()
  );
  assert.equal(result.created, true);
  assert.equal(result.followUp.entityType, "client");
  assert.equal(result.followUp.entityId, CLIENT_ID);
});

test("Today includes overdue and due service cases but not upcoming ones", async () => {
  await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Overdue service",
      dueDate: "2026-08-20",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Upcoming service",
      dueDate: "2026-09-20",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  todayService.setSourcesForTests({
    loadProspects: async () => [],
    loadAppointments: async () => [],
    listFollowUps: async () => ({ items: [] }),
    listNotifications: async () => [],
    listServiceCases: (options) => clientServiceApplicationService.listServiceCases(options),
    timezoneDeps: {
      getOrganizationSettings: () => ({ timezone: "America/New_York" }),
      getOrganizationProfileTimezone: () => "America/New_York"
    }
  });
  const today = await todayService.getToday({
    organizationId: ORG_A,
    authContext: auth(),
    reference: new Date("2026-08-30T16:00:00.000Z")
  });
  const serviceItems = today.sections.followUps.filter((item) => item.kind === "service_case");
  assert.equal(serviceItems.some((item) => item.title === "Overdue service"), true);
  assert.equal(serviceItems.some((item) => item.title === "Upcoming service"), false);
});

test("wrong organization and unauthorized peer fail closed as 404", async () => {
  const created = await clientServiceApplicationService.createServiceCase(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Isolation"
    },
    auth()
  );
  await assert.rejects(
    () =>
      clientServiceApplicationService.getServiceCase(created.id, {
        organizationId: ORG_B,
        authContext: auth()
      }),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    () =>
      clientServiceApplicationService.updateStatus(
        created.id,
        { organizationId: ORG_A, status: SERVICE_STATUSES.CANCELLED },
        auth(USER_B)
      ),
    (error) => error.statusCode === 404
  );
});

test("control-plane empty payload has no tenant service cases", () => {
  const empty = emptyServiceCases();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.counts.open, 0);
  assert.equal(emptyServiceCaseDetail().id, null);
});

test("BR-182 routes, migration, and recruiting stay isolated", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/serviceCases.js"), "utf8");
  const service = fs.readFileSync(
    path.join(__dirname, "../application/clientServiceApplicationService.js"),
    "utf8"
  );
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/ServicePage.jsx"), "utf8");
  const clientsPage = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/ClientsPage.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(__dirname, "../../frontend/src/config/workspaceExperience.js"), "utf8");
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  const interpreter = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/interpreter.js"), "utf8");
  const prospectCenter = fs.readFileSync(path.join(__dirname, "../core/prospectCenterReadModel.js"), "utf8");
  const iul = fs.readFileSync(path.join(__dirname, "../core/iulFollowUpWorklistEngine.js"), "utf8");
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/065_br182_client_service.sql"),
    "utf8"
  );

  assert.match(routes, /operationalControlPlaneEmpty\(emptyServiceCases\)/);
  assert.match(routes, /organizationGuard\(\)/);
  assert.match(routes, /getTenantOrganizationId/);
  assert.doesNotMatch(routes, /req\.body\.phone|fromPhone|tenantPhone/);
  assert.match(server, /app\.use\("\/api\/service-cases", serviceCasesRoutes\)/);
  assert.match(service, /POLICY_REVIEW is a service case/);
  assert.doesNotMatch(service, /loadProductionProspects|\/api\/prospects|recruitAiV2|createProspect/);
  assert.match(page, /getServiceCases/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|\/api\/prospects|recruitAiV2/);
  assert.match(clientsPage, /getServiceCases\(\{ clientId/);
  assert.match(nav, /"production",\s*"service"/);
  assert.doesNotMatch(recruitDecision, /clientServiceApplicationService|atlas_client_service_cases/);
  assert.doesNotMatch(interpreter, /clientServiceApplicationService|atlas_client_service_cases/);
  assert.doesNotMatch(prospectCenter, /clientServiceApplicationService|atlas_client_service_cases/);
  assert.doesNotMatch(iul, /clientServiceApplicationService|atlas_client_service_cases/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS atlas_client_service_cases/);
  assert.match(migration, /REFERENCES atlas_agenda_clients/);
  assert.match(migration, /due_date DATE/);
  assert.match(migration, /REVOKE ALL ON TABLE atlas_client_service_cases FROM anon, authenticated/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
